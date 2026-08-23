package online.eyeme.neoledger.companion;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

final class PendingEventStore extends SQLiteOpenHelper {
    private static final int DATABASE_VERSION = 2;
    private static final long SEEN_RETENTION_MILLIS = 7L * 24 * 60 * 60 * 1000;
    private static final long SCREEN_SESSION_DEDUP_MILLIS = 45_000L;
    private static final int MAX_SEEN_EVENTS = 500;

    enum EnqueueResult { QUEUED, DUPLICATE }

    static final class Event {
        final String id;
        final String text;
        final String source;
        final String occurredAt;
        final int attempts;

        Event(String id, String text, String source, String occurredAt, int attempts) {
            this.id = id;
            this.text = text;
            this.source = source;
            this.occurredAt = occurredAt;
            this.attempts = attempts;
        }
    }

    PendingEventStore(Context context) {
        super(context.getApplicationContext(), "neo_pending_events.db", null, DATABASE_VERSION);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE pending_events(id TEXT PRIMARY KEY,text TEXT NOT NULL,source TEXT NOT NULL,occurred_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE TABLE seen_notifications(fingerprint TEXT PRIMARY KEY,seen_at INTEGER NOT NULL)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2)
            db.execSQL("CREATE TABLE IF NOT EXISTS seen_notifications(fingerprint TEXT PRIMARY KEY,seen_at INTEGER NOT NULL)");
    }

    /**
     * Claims and queues a notification atomically. This is persistent, unlike
     * a single last-seen value, so notification updates and process restarts
     * cannot create duplicate ledger events or lose a claim between the two
     * operations.
     */
    synchronized EnqueueResult enqueueIfNew(
            String fingerprint,
            String id,
            String text,
            String source,
            String packageName,
            String amount,
            String mode,
            long occurredAtMillis,
            long now) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete(
                    "seen_notifications",
                    "seen_at<?",
                    new String[]{String.valueOf(now - SEEN_RETENTION_MILLIS)});
            if (hasRecentOtherMode(db, packageName, amount, mode, now)
                    || ("screen".equals(mode) && hasRecentScreenSession(db, packageName, amount, now))) {
                db.setTransactionSuccessful();
                return EnqueueResult.DUPLICATE;
            }
            ContentValues values = new ContentValues();
            values.put("fingerprint", fingerprint);
            values.put("seen_at", now);
            long inserted = db.insertWithOnConflict(
                    "seen_notifications", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            if (inserted == -1) {
                db.setTransactionSuccessful();
                return EnqueueResult.DUPLICATE;
            }
            ContentValues event = new ContentValues();
            event.put("id", id);
            event.put("text", text);
            event.put("source", source);
            event.put("occurred_at", ApiTime.fromEpochMillis(occurredAtMillis));
            event.put("attempts", 0);
            event.put("next_attempt", 0);
            event.put("last_error", "");
            long queued = db.insertWithOnConflict(
                    "pending_events", null, event, SQLiteDatabase.CONFLICT_IGNORE);
            if (queued == -1) {
                return EnqueueResult.DUPLICATE;
            }
            if ("screen".equals(mode)) {
                ContentValues session = new ContentValues();
                session.put("fingerprint", screenSessionMarker(packageName, amount));
                session.put("seen_at", now);
                db.insertWithOnConflict(
                        "seen_notifications", null, session, SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.execSQL(
                    "DELETE FROM seen_notifications WHERE fingerprint NOT IN " +
                            "(SELECT fingerprint FROM seen_notifications ORDER BY seen_at DESC LIMIT ?)",
                    new Object[]{MAX_SEEN_EVENTS});
            db.setTransactionSuccessful();
            return EnqueueResult.QUEUED;
        } finally {
            db.endTransaction();
        }
    }

    private boolean hasRecentOtherMode(
            SQLiteDatabase db, String packageName, String amount, String mode, long now) {
        if (packageName == null || packageName.isEmpty() || amount == null || amount.isEmpty()
                || mode == null || mode.isEmpty()) return false;
        String otherMode = "screen".equals(mode) ? "notification" : "screen";
        String prefix = packageName + "|" + otherMode + "|amount=" + amount + "|";
        try (Cursor cursor = db.query(
                "seen_notifications",
                new String[]{"fingerprint"},
                "seen_at>?",
                new String[]{String.valueOf(now - 120_000L)},
                null, null, null, null)) {
            while (cursor.moveToNext()) {
                if (cursor.getString(0).startsWith(prefix)) return true;
            }
        }
        return false;
    }

    private boolean hasRecentScreenSession(
            SQLiteDatabase db, String packageName, String amount, long now) {
        if (packageName == null || packageName.isEmpty() || amount == null || amount.isEmpty()) return false;
        try (Cursor cursor = db.query(
                "seen_notifications",
                new String[]{"fingerprint"},
                "fingerprint=? AND seen_at>?",
                new String[]{screenSessionMarker(packageName, amount),
                        String.valueOf(now - SCREEN_SESSION_DEDUP_MILLIS)},
                null, null, null, "1")) {
            return cursor.moveToFirst();
        }
    }

    private String screenSessionMarker(String packageName, String amount) {
        return "screen-session|" + packageName + "|amount=" + amount;
    }

    List<Event> ready(int limit) {
        List<Event> events = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                "pending_events",
                new String[]{"id", "text", "source", "occurred_at", "attempts"},
                "next_attempt<=?",
                new String[]{String.valueOf(System.currentTimeMillis())},
                null, null, "rowid ASC", String.valueOf(limit))) {
            while (cursor.moveToNext()) events.add(new Event(
                    cursor.getString(0), cursor.getString(1), cursor.getString(2),
                    cursor.getString(3), cursor.getInt(4)));
        }
        return events;
    }

    void remove(String id) {
        getWritableDatabase().delete("pending_events", "id=?", new String[]{id});
    }

    void failed(Event event, String error, boolean retryable) {
        if (!retryable || event.attempts >= 19) {
            remove(event.id);
            return;
        }
        int attempts = event.attempts + 1;
        long delay = Math.min(6L * 60 * 60 * 1000, 30_000L * (1L << Math.min(attempts - 1, 9)));
        ContentValues values = new ContentValues();
        values.put("attempts", attempts);
        values.put("next_attempt", System.currentTimeMillis() + delay);
        values.put("last_error", error);
        getWritableDatabase().update("pending_events", values, "id=?", new String[]{event.id});
    }

    int count() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT count(*) FROM pending_events", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }
}
