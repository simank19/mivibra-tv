plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Inicio MiVibra: launcher estilo consola para Android TV. App aparte de MiVibra TV (misma llave de firma).
android {
    namespace = "co.mivibra.inicio"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.mivibra.inicio"
        minSdk = 23
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        create("mivibra") {
            storeFile = file("../app/mivibra.keystore")
            storePassword = "mivibratv"
            keyAlias = "mivibra"
            keyPassword = "mivibratv"
        }
    }
    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("mivibra") }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("mivibra")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    // Permiso de Google Fotos (fondos) con la cuenta de la TV
    implementation("com.google.android.gms:play-services-auth:21.2.0")
    // Servidor local para subir fondos desde el celular
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
