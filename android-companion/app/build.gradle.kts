plugins {
    id("com.android.application")
}

android {
    namespace = "online.eyeme.neoledger.companion"
    compileSdk = 35
    val releaseKeyPath = System.getenv("ANDROID_KEYSTORE_PATH")

    defaultConfig {
        applicationId = "online.eyeme.neoledger.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "1.1.6"
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (!releaseKeyPath.isNullOrBlank()) {
            create("release") {
                storeFile = file(releaseKeyPath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            if (!releaseKeyPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
