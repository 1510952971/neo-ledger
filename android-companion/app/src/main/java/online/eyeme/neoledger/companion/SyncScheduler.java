package online.eyeme.neoledger.companion;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class SyncScheduler {
    private static final int JOB_ID = 904221;

    static void schedule(Context context, boolean immediate) {
        JobInfo.Builder job = new JobInfo.Builder(
                JOB_ID, new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
        if (!immediate) job.setMinimumLatency(30_000);
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) scheduler.schedule(job.build());
    }

    private SyncScheduler() {}
}
