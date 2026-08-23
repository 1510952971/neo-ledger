package online.eyeme.neoledger.companion;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Intent;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class SyncJobService extends JobService {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override public boolean onStartJob(JobParameters params) {
        executor.execute(() -> {
            PendingEventStore queue = new PendingEventStore(this);
            List<PendingEventStore.Event> events = queue.ready(20);
            boolean retry = false;
            for (PendingEventStore.Event event : events) {
                HttpSender.Result result = HttpSender.sendNow(
                        this, event.text, event.source, event.id, event.occurredAt);
                if (result.ok) queue.remove(event.id);
                else {
                    queue.failed(event, result.message, result.retryable);
                    retry |= result.retryable;
                }
                new SettingsStore(this).recordDelivery(result);
            }
            sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
            if (queue.count() > 0) SyncScheduler.schedule(this, false);
            jobFinished(params, retry);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        return true;
    }
}
