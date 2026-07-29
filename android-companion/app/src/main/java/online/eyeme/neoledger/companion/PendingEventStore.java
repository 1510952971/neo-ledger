package online.eyeme.neoledger.companion;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

final class PendingEventStore extends SQLiteOpenHelper {
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
        super(context.getApplicationContext(), "neo_pending_events.db", null, 1);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE pending_events(id TEXT PRIMARY KEY,text TEXT NOT NULL,source TEXT NOT NULL,occurred_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '')");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    void enqueue(String id, String text, String source, long occurredAtMillis) {
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("text", text);
        values.put("source", source);
        values.put("occurred_at", Instant.ofEpochMilli(occurredAtMillis).toString());
        getWritableDatabase().insertWithOnConflict("pending_events", null, values, SQLiteDatabase.CONFLICT_IGNORE);
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
