package online.eyeme.neoledger.companion;

/**
 * Compatibility constants needed by the shared companion service sources.
 *
 * <p>The companion sources are compiled into the unified Flutter APK under a
 * different package, so they cannot use their original generated BuildConfig.
 * Delegate the version to the Android application's generated BuildConfig to
 * keep the network client version in sync with the APK version.</p>
 */
public final class BuildConfig {
    public static final String VERSION_NAME = online.eyeme.neo_ledger.BuildConfig.VERSION_NAME;

    private BuildConfig() {}
}
