plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "co.mivibra.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.mivibra.tv"
        minSdk = 23
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    // Llave fija para que cada APK nueva se instale encima de la anterior.
    // TODO Brandon: si algún día publicas la app, crea una llave privada y no la subas al repositorio.
    signingConfigs {
        create("mivibra") {
            storeFile = file("mivibra.keystore")
            storePassword = "mivibratv"
            keyAlias = "mivibra"
            keyPassword = "mivibratv"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("mivibra")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("mivibra")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
        resources {
            excludes += setOf("META-INF/*.kotlin_module", "META-INF/AL2.0", "META-INF/LGPL2.1")
        }
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
    androidResources {
        // Los avatares y la interfaz web viven en assets; no comprimir los PNG otra vez.
        noCompress += listOf("png")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Reproductor de video (HLS, DASH, MPEG-TS, MP4), subtítulos y pistas de audio
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-exoplayer-dash:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")

    // Servidor local para usar el celular como mando
    implementation("org.nanohttpd:nanohttpd-websocket:2.3.1")

    // Emulación de consolas (núcleos libretro)
    implementation("com.github.Swordfish90:LibretroDroid:0.14.0")
}
