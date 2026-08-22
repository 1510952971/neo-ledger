package online.eyeme.neoledger.companion;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/** Private, read-only provider for handing the downloaded APK to Android's installer. */
public final class NeoApkFileProvider extends ContentProvider {
    static Uri uriForFile(android.content.Context context, File file) {
        return new Uri.Builder()
                .scheme("content")
                .authority(context.getPackageName() + ".apkprovider")
                .path("/" + file.getName())
                .build();
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("read-only");
        File file = updateFile(uri);
        if (!file.isFile()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args,
                                  String sortOrder) {
        File file = updateFile(uri);
        MatrixCursor cursor = new MatrixCursor(new String[]{"_display_name", "_size"});
        if (file.isFile()) cursor.addRow(new Object[]{file.getName(), file.length()});
        return cursor;
    }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }

    private File updateFile(Uri uri) {
        File directory = new File(requireContext().getCacheDir(), "updates");
        File file = new File(directory, uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment());
        try {
            String root = directory.getCanonicalPath();
            String path = file.getCanonicalPath();
            if (!path.startsWith(root + File.separator)) return new File(directory, "invalid");
        } catch (Exception ignored) {
            return new File(directory, "invalid");
        }
        return file;
    }
}
