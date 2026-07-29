package online.eyeme.neoledger.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (new PendingEventStore(context).count() > 0) SyncScheduler.schedule(context, false);
    }
}
