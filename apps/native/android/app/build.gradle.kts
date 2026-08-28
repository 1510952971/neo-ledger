plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val configuredKeystorePath =
    project.findProperty("neoLedgerKeystorePath") as String?
val configuredKeystorePassword =
    project.findProperty("neoLedgerKeystorePassword") as String?
val configuredKeyAlias = project.findProperty("neoLedgerKeyAlias") as String?
val configuredKeyPassword =
    project.findProperty("neoLedgerKeyPassword") as String?
val allowDebugSigning =
    (project.findProperty("neoLedgerAllowDebugSigning") as String?)
        ?.toBoolean() ?: true

android {
    namespace = "online.eyeme.neo_ledger"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "online.eyeme.neo_ledger"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = maxOf(flutter.minSdkVersion, 26)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (!configuredKeystorePath.isNullOrBlank() &&
            !configuredKeystorePassword.isNullOrBlank() &&
            !configuredKeyAlias.isNullOrBlank() &&
            !configuredKeyPassword.isNullOrBlank()) {
            create("release") {
                storeFile = file(configuredKeystorePath)
                storePassword = configuredKeystorePassword
                keyAlias = configuredKeyAlias
                keyPassword = configuredKeyPassword
            }
        }
    }

    buildTypes {
        release {
            val releaseSigning = signingConfigs.findByName("release")
            if (releaseSigning != null) {
                signingConfig = releaseSigning
            } else if (allowDebugSigning) {
                // Local development builds can opt into debug signing explicitly.
                signingConfig = signingConfigs.getByName("debug")
            } else {
                throw GradleException(
                    "正式发布必须提供 Android 签名参数：" +
                        "neoLedgerKeystorePath/Password/KeyAlias/KeyPassword",
                )
            }
        }
    }

    // Reuse the tested notification/accessibility implementation in the full
    // Flutter APK. The companion source tree is intentionally compiled into
    // this application so users do not need to install a second APK.
    sourceSets {
        getByName("main") {
            java.srcDirs("../../../../android-companion/app/src/main/java")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    implementation("com.google.mlkit:text-recognition-chinese:16.0.1")
}
