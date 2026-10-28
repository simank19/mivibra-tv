package co.mivibra.tv.diag;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AppOpsManager;
import android.app.usage.StorageStats;
import android.app.usage.StorageStatsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.PowerManager;
import android.os.Process;
import android.os.storage.StorageManager;
import android.util.Base64;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.fingerprint.FingerprintManager;
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.nfc.NfcAdapter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.os.SystemClock;
import android.os.HandlerThread;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.telephony.SignalStrength;
import android.telephony.TelephonyManager;
import android.util.DisplayMetrics;
import android.util.Size;
import android.view.Display;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.Comparator;

/**
 * Diagnóstico MiVibra — contenedor nativo.
 * La interfaz vive en assets/index.html y habla con el hardware a través del objeto JS "Android".
 */
/** Diagnóstico y optimización de MiVibra dentro de MiVibra TV (Utilidades). Interfaz en assets/diag. */
public class DiagActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    private static final int REQ_WEB = 900;

    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean keyCapture = false;
    private PermissionRequest pendingWeb;
    private BroadcastReceiver rx;

    private SensorManager sm;
    private SensorEventListener sensorL;
    private final long[] lastEmit = new long[128];

    private LocationManager lm;
    private LocationListener locL;
    private Object gnssCb;

    private volatile boolean recOn = false;
    private volatile float micLvl = 0f;
    private Thread recThread;

    private CancellationSignal bioCancel;

    // optimización
    private static final int REQ_CACHE = 901;
    private long cacheFreeBefore = -1;
    private final Map<String, List<File>> junk = new HashMap<String, List<File>>();
    private final List<File> largeFiles = new ArrayList<File>();
    private volatile boolean scanning = false;
    private long scanCount = 0, lastProg = 0;

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        sm = (SensorManager) getSystemService(SENSOR_SERVICE);
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0D0C0B);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) { return handleUrl(url); }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return handleUrl(r.getUrl().toString()); }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return serveAsset(r.getUrl()); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest r) {
                runOnUiThread(new Runnable() { public void run() { handleWebPerm(r); } });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl(HOME);
        setContentView(web);
        registerRx();
    }

    @Override
    protected void onDestroy() {
        try { if (rx != null) unregisterReceiver(rx); } catch (Exception ignored) {}
        stopAll();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        super.onPause();
        emit("app", "{\"s\":\"pause\"}");
    }

    @Override
    protected void onResume() {
        super.onResume();
        emit("app", "{\"s\":\"resume\"}");
    }

    private void stopAll() {
        try { if (sensorL != null) sm.unregisterListener(sensorL); } catch (Exception ignored) {}
        gpsStopInternal();
        recOn = false;
        try { torchSet(false); } catch (Exception ignored) {}
    }

    @Override
    public void onBackPressed() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("(window.__back&&window.__back())?'1':'0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (v == null || !v.contains("1")) finish();
            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (keyCapture && (k == KeyEvent.KEYCODE_VOLUME_UP || k == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0)
                emit("key", "{\"k\":\"" + (k == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down") + "\"}");
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // ------------------------------------------------------------------ web helpers

    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("https://" + HOST)) return false;
        openExternal(url);
        return true;
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private WebResourceResponse serveAsset(Uri u) {
        if (u == null || !HOST.equals(u.getHost())) return null;
        String p = u.getPath();
        if (p == null || p.equals("/") || p.isEmpty()) p = "/index.html";
        p = p.substring(1);
        String mime = "text/plain";
        if (p.endsWith(".html")) mime = "text/html";
        else if (p.endsWith(".js")) mime = "application/javascript";
        else if (p.endsWith(".css")) mime = "text/css";
        else if (p.endsWith(".png")) mime = "image/png";
        else if (p.endsWith(".svg")) mime = "image/svg+xml";
        else if (p.endsWith(".json")) mime = "application/json";
        try {
            InputStream in = getAssets().open("diag/" + p);
            return new WebResourceResponse(mime, "utf-8", in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(), null);
        }
    }

    private void handleWebPerm(PermissionRequest r) {
        List<String> need = new ArrayList<String>();
        for (String res : r.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) && !has(Manifest.permission.CAMERA))
                need.add(Manifest.permission.CAMERA);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) && !has(Manifest.permission.RECORD_AUDIO))
                need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (need.isEmpty()) { r.grant(r.getResources()); return; }
        pendingWeb = r;
        requestPermissions(need.toArray(new String[0]), REQ_WEB);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_WEB) {
            PermissionRequest r = pendingWeb;
            pendingWeb = null;
            if (r == null) return;
            List<String> ok = new ArrayList<String>();
            for (String x : r.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(x) && has(Manifest.permission.CAMERA)) ok.add(x);
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(x) && has(Manifest.permission.RECORD_AUDIO)) ok.add(x);
            }
            if (ok.isEmpty()) r.deny(); else r.grant(ok.toArray(new String[0]));
            return;
        }
        boolean all = res.length > 0;
        for (int v : res) if (v != PackageManager.PERMISSION_GRANTED) all = false;
        emit("perm", "{\"id\":" + code + ",\"granted\":" + all + "}");
    }

    private boolean has(String p) {
        return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    private void emit(final String type, final String json) {
        main.post(new Runnable() {
            public void run() {
                if (web != null)
                    web.evaluateJavascript("window.__nat&&window.__nat('" + type + "'," + json + ")", null);
            }
        });
    }

    // ------------------------------------------------------------------ broadcasts

    private void registerRx() {
        rx = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                String a = i.getAction();
                if (a == null) return;
                try {
                    if (Intent.ACTION_BATTERY_CHANGED.equals(a)) emit("battery", batteryJson(i).toString());
                    else if (Intent.ACTION_POWER_CONNECTED.equals(a) || Intent.ACTION_POWER_DISCONNECTED.equals(a)) {
                        Intent st = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                        JSONObject o = st != null ? batteryJson(st) : new JSONObject();
                        o.put("plugEvent", Intent.ACTION_POWER_CONNECTED.equals(a));
                        emit("battery", o.toString());
                    } else if (Intent.ACTION_SCREEN_OFF.equals(a)) emit("power", "{\"s\":\"off\"}");
                    else if (Intent.ACTION_SCREEN_ON.equals(a)) emit("power", "{\"s\":\"on\"}");
                    else if (Intent.ACTION_USER_PRESENT.equals(a)) emit("power", "{\"s\":\"unlock\"}");
                    else if (AudioManager.ACTION_HEADSET_PLUG.equals(a)) {
                        JSONObject o = new JSONObject();
                        o.put("plugged", i.getIntExtra("state", 0) == 1);
                        o.put("mic", i.getIntExtra("microphone", 0) == 1);
                        o.put("name", i.getStringExtra("name"));
                        emit("headset", o.toString());
                    }
                } catch (Exception ignored) {}
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_BATTERY_CHANGED);
        f.addAction(Intent.ACTION_POWER_CONNECTED);
        f.addAction(Intent.ACTION_POWER_DISCONNECTED);
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        f.addAction(AudioManager.ACTION_HEADSET_PLUG);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(rx, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(rx, f);
    }

    // ------------------------------------------------------------------ utilidades de sistema

    private static String getprop(String key) {
        try {
            Class<?> c = Class.forName("android.os.SystemProperties");
            Method m = c.getMethod("get", String.class);
            Object v = m.invoke(null, key);
            if (v != null && !v.toString().trim().isEmpty()) return v.toString().trim();
        } catch (Throwable ignored) {}
        try {
            java.lang.Process p = Runtime.getRuntime().exec(new String[]{"getprop", key});
            BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String l = br.readLine();
            br.close();
            return l == null ? "" : l.trim();
        } catch (Throwable ignored) {}
        return "";
    }

    private static String readFile(String path) {
        try {
            BufferedReader br = new BufferedReader(new FileReader(path));
            StringBuilder sb = new StringBuilder();
            String l;
            while ((l = br.readLine()) != null) sb.append(l).append('\n');
            br.close();
            return sb.toString().trim();
        } catch (Throwable e) {
            return "";
        }
    }

    private static long readLong(String path) {
        try { return Long.parseLong(readFile(path).trim()); } catch (Throwable e) { return -1; }
    }

    private String marketName() {
        String[] keys = {
                "ro.product.marketname", "ro.product.vendor.marketname", "ro.product.odm.marketname",
                "ro.product.system.marketname", "ro.vendor.product.marketname", "ro.config.marketing_name",
                "ro.vendor.oplus.market.name", "ro.oppo.market.name", "ro.vendor.vivo.market.name",
                "ro.vivo.market.name", "ro.product.vendor.oplus.market.name", "ro.vendor.product.display",
                "ro.semc.product.name", "ro.product.nickname"
        };
        for (String k : keys) {
            String v = getprop(k);
            if (!v.isEmpty() && !v.equalsIgnoreCase(Build.MODEL)) return v;
        }
        try {
            String dn = Build.VERSION.SDK_INT >= 25 ? Settings.Global.getString(getContentResolver(), "device_name") : null;
            if (dn != null && "samsung".equalsIgnoreCase(Build.MANUFACTURER) && dn.startsWith("Galaxy")) return dn;
            String bn = Settings.Secure.getString(getContentResolver(), "bluetooth_name");
            if (bn != null && "samsung".equalsIgnoreCase(Build.MANUFACTURER) && bn.startsWith("Galaxy")) return bn;
        } catch (Throwable ignored) {}
        return "";
    }

    private boolean isRooted() {
        if (Build.TAGS != null && Build.TAGS.contains("test-keys")) return true;
        String[] p = {"/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su", "/data/local/xbin/su",
                "/data/local/bin/su", "/system/sd/xbin/su", "/data/adb/magisk", "/system/app/Superuser.apk"};
        for (String s : p) if (new File(s).exists()) return true;
        return false;
    }

    private double designCapacity() {
        try {
            Class<?> c = Class.forName("com.android.internal.os.PowerProfile");
            Object pp = c.getConstructor(Context.class).newInstance(this);
            Object v = c.getMethod("getBatteryCapacity").invoke(pp);
            double d = ((Number) v).doubleValue();
            if (d > 500 && d < 30000) return d;
        } catch (Throwable ignored) {}
        String[] f = {"/sys/class/power_supply/battery/charge_full_design", "/sys/class/power_supply/bms/charge_full_design"};
        for (String p : f) {
            long v = readLong(p);
            if (v > 500000) return v / 1000.0;
            if (v > 500 && v < 30000) return v;
        }
        return -1;
    }

    /** Salud que guarda el propio equipo (medidor de batería), en %. Devuelve {valor, fuente} o null. */
    private Object[] systemSoh(BatteryManager bm) {
        if (bm != null && Build.VERSION.SDK_INT >= 34) {
            try {
                int v = bm.getIntProperty(10); // BATTERY_PROPERTY_STATE_OF_HEALTH (Android 14)
                if (v > 0 && v <= 100) return new Object[]{v, "system"};
            } catch (Throwable ignored) {}
        }
        String[] files = {
                "/sys/class/power_supply/battery/fg_asoc", "/sys/class/power_supply/battery/asoc",
                "/sys/class/power_supply/battery/battery_asoc", "/sys/class/power_supply/battery/soh",
                "/sys/class/power_supply/battery/state_of_health", "/sys/class/power_supply/battery/battery_soh",
                "/sys/class/power_supply/bms/soh", "/sys/class/power_supply/bms/battery_soh",
                "/sys/class/qcom-battery/soh", "/sys/class/oplus_chg/battery/battery_soh"
        };
        for (String p : files) {
            long v = readLong(p);
            if (v >= 1 && v <= 100) return new Object[]{(int) v, "fuelgauge"};
        }
        return null;
    }

    private JSONObject batteryJson(Intent i) throws Exception { return batteryJson(i, false); }

    private JSONObject batteryJson(Intent i, boolean deep) throws Exception {
        JSONObject o = new JSONObject();
        int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int pct = scale > 0 && level >= 0 ? Math.round(level * 100f / scale) : -1;
        o.put("level", pct);
        o.put("status", i.getIntExtra(BatteryManager.EXTRA_STATUS, -1));
        o.put("plugged", i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0));
        o.put("health", i.getIntExtra(BatteryManager.EXTRA_HEALTH, -1));
        o.put("temp", i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1000) / 10.0);
        o.put("voltage", i.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1));
        o.put("tech", i.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY));
        o.put("present", i.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true));
        int cyc = i.getIntExtra("android.os.extra.CYCLE_COUNT", -1);
        if (cyc < 0) {
            long c2 = readLong("/sys/class/power_supply/battery/cycle_count");
            if (c2 < 0) c2 = readLong("/sys/class/power_supply/bms/cycle_count");
            if (c2 >= 0 && c2 < 10000) cyc = (int) c2;
        }
        o.put("cycles", cyc);

        BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
        long cc = -1, cur = Long.MIN_VALUE;
        if (bm != null) {
            cc = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);
            cur = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW);
            if (deep && cc > 0) {
                // promedia varias lecturas para reducir el ruido del medidor
                long sum = cc; int n = 1;
                for (int k = 0; k < 7; k++) {
                    try { Thread.sleep(180); } catch (InterruptedException ignored) {}
                    long v = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);
                    if (v > 0) { sum += v; n++; }
                }
                cc = sum / n;
            }
        }
        if (cur != Long.MIN_VALUE && cur != Integer.MIN_VALUE) {
            double mA = Math.abs(cur) > 20000 ? cur / 1000.0 : cur;
            o.put("currentMa", Math.round(mA));
        }
        double design = designCapacity();
        if (design > 0) o.put("designMah", Math.round(design));

        // 1) salud que reporta el equipo  2) capacidad aprendida / de fábrica  3) estimación
        double full = -1;
        String[] fullFiles = {"/sys/class/power_supply/battery/charge_full", "/sys/class/power_supply/bms/charge_full"};
        for (String p : fullFiles) {
            long cf = readLong(p);
            if (cf > 500000) { full = cf / 1000.0; break; }
            if (cf > 500 && cf < 30000) { full = cf; break; }
        }
        double est = -1;
        if (cc > 0 && pct >= 20) {
            est = cc / 1000.0 / pct * 100.0;
            if (est < 30) est = cc / (double) pct * 100.0;
            if (est < 500 || est > 30000) est = -1;
        }
        if (est > 0) o.put("estMah", Math.round(est));

        Object[] sys = systemSoh(bm);
        if (sys != null) {
            o.put("healthPct", sys[0]);
            o.put("healthSrc", sys[1]);
        } else if (full > 0 && design > 0) {
            o.put("healthPct", Math.min(100, Math.round(full / design * 100)));
            o.put("healthSrc", "capacity");
        } else if (est > 0 && design > 0) {
            long e = Math.min(100, Math.round(est / design * 100));
            o.put("healthPct", e);
            o.put("healthSrc", "estimate");
            o.put("healthLo", Math.max(0, e - 8));
            o.put("healthHi", Math.min(100, e + 8));
        }
        if (full > 0) o.put("fullMah", Math.round(full));
        else if (sys != null && design > 0) o.put("fullMah", Math.round(design * ((Integer) sys[0]) / 100.0));
        else if (est > 0) o.put("fullMah", Math.round(est));
        return o;
    }

    private static String clusterSummary(int cores) {
        TreeMap<Long, Integer> m = new TreeMap<Long, Integer>();
        for (int i = 0; i < cores; i++) {
            long f = readLong("/sys/devices/system/cpu/cpu" + i + "/cpufreq/cpuinfo_max_freq");
            if (f > 0) { Integer c = m.get(f); m.put(f, c == null ? 1 : c + 1); }
        }
        StringBuilder sb = new StringBuilder();
        for (Long f : m.descendingKeySet()) {
            if (sb.length() > 0) sb.append(" + ");
            sb.append(m.get(f)).append("×").append(String.format(Locale.US, "%.2f", f / 1e6)).append(" GHz");
        }
        return sb.toString();
    }

    private static String cpuHardware() {
        String ci = readFile("/proc/cpuinfo");
        for (String l : ci.split("\n")) {
            String t = l.toLowerCase(Locale.US);
            if (t.startsWith("hardware") || t.startsWith("model name")) {
                int i = l.indexOf(':');
                if (i > 0) return l.substring(i + 1).trim();
            }
        }
        return "";
    }

    private void torchSet(boolean on) throws Exception {
        CameraManager cm = (CameraManager) getSystemService(CAMERA_SERVICE);
        for (String id : cm.getCameraIdList()) {
            CameraCharacteristics ch = cm.getCameraCharacteristics(id);
            Boolean fl = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
            if (fl != null && fl && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                cm.setTorchMode(id, on);
                return;
            }
        }
        throw new Exception("sin flash");
    }

    private void gpsStopInternal() {
        try { if (locL != null) lm.removeUpdates(locL); } catch (Exception ignored) {}
        try {
            if (gnssCb != null && Build.VERSION.SDK_INT >= 24) lm.unregisterGnssStatusCallback((GnssStatus.Callback) gnssCb);
        } catch (Exception ignored) {}
        locL = null;
        gnssCb = null;
    }

    private synchronized void playTone(boolean ear, int ms) {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        int prevMode = am.getMode();
        int stream = ear ? AudioManager.STREAM_VOICE_CALL : AudioManager.STREAM_MUSIC;
        int prevVol = am.getStreamVolume(stream);
        try {
            if (ear) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                am.setSpeakerphoneOn(false);
                if (Build.VERSION.SDK_INT >= 31) {
                    for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                        if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) { am.setCommunicationDevice(d); break; }
                    }
                }
            }
            am.setStreamVolume(stream, Math.max(1, (int) (am.getStreamMaxVolume(stream) * 0.85)), 0);
        } catch (Exception ignored) {}

        int sr = 44100, n = sr * ms / 1000, seg = sr / 4;
        double[] fr = {660, 880, 1320, 880};
        short[] pcm = new short[n];
        for (int i = 0; i < n; i++) {
            double f = fr[(i / seg) % fr.length];
            int p = i % seg;
            double env = Math.min(1.0, Math.min(p, seg - p) / (sr * 0.01));
            pcm[i] = (short) (Math.sin(2 * Math.PI * f * i / sr) * env * 0.8 * 32767);
        }
        AudioTrack t = null;
        try {
            AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(ear ? AudioAttributes.USAGE_VOICE_COMMUNICATION : AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            AudioFormat af = new AudioFormat.Builder().setSampleRate(sr)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build();
            t = new AudioTrack(aa, af, n * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
            t.write(pcm, 0, n);
            t.play();
            Thread.sleep(ms + 150);
        } catch (Exception e) {
            emit("tone", "{\"err\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
        } finally {
            if (t != null) { try { t.stop(); } catch (Exception ignored) {} t.release(); }
            try {
                am.setStreamVolume(stream, prevVol, 0);
                if (ear) {
                    if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
                    am.setMode(prevMode);
                }
            } catch (Exception ignored) {}
        }
        emit("tone", "{\"done\":true}");
    }

    private Vibrator getVib() {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) getSystemService(VibratorManager.class);
                if (vm != null) return vm.getDefaultVibrator();
            }
        } catch (Throwable ignored) {}
        return (Vibrator) getSystemService(VIBRATOR_SERVICE);
    }

    /** Vibra como alarma: no lo silencian el modo silencio ni la intensidad "táctil/multimedia" en cero. */
    private void doVibrate(long[] pat) {
        Vibrator v = getVib();
        if (v == null) return;
        AudioAttributes alarm = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                int[] amp = new int[pat.length];
                for (int i = 0; i < pat.length; i++) amp[i] = (i % 2 == 1) ? 255 : 0;
                VibrationEffect fx = v.hasAmplitudeControl()
                        ? VibrationEffect.createWaveform(pat, amp, -1)
                        : VibrationEffect.createWaveform(pat, -1);
                if (Build.VERSION.SDK_INT >= 33)
                    v.vibrate(fx, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
                else
                    v.vibrate(fx, alarm);
            } else {
                v.vibrate(pat, -1, alarm);
            }
        } catch (Throwable e) {
            try { v.vibrate(pat, -1); } catch (Throwable ignored) {}
        }
    }

    private static double std(double[] a, int n) {
        if (n < 2) return 0;
        double m = 0;
        for (int i = 0; i < n; i++) m += a[i];
        m /= n;
        double s = 0;
        for (int i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m);
        return Math.sqrt(s / n);
    }

    // ------------------------------------------------------------------ optimización (utilidades)

    @Override
    protected void onActivityResult(int req, final int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_CACHE) {
            main.postDelayed(new Runnable() {
                public void run() {
                    long freed = Math.max(0, freeBytes() - cacheFreeBefore);
                    emit("cache", "{\"ok\":" + (res == RESULT_OK) + ",\"freed\":" + freed + "}");
                }
            }, 900);
        }
    }

    private long freeBytes() {
        try { return new StatFs(Environment.getDataDirectory().getPath()).getAvailableBytes(); } catch (Exception e) { return 0; }
    }

    private boolean allFilesAccess() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return has(Manifest.permission.READ_EXTERNAL_STORAGE) && has(Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    private boolean usageAccess() {
        try {
            AppOpsManager ao = (AppOpsManager) getSystemService(APP_OPS_SERVICE);
            int mode = Build.VERSION.SDK_INT >= 29
                    ? ao.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName())
                    : ao.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Throwable e) { return false; }
    }

    private static void deleteChildren(File dir) {
        File[] ch = dir.listFiles();
        if (ch == null) return;
        for (File f : ch) {
            if (f.isDirectory()) deleteChildren(f);
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private static String b64Icon(Drawable d, int size) {
        try {
            Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, size, size);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 90, out);
            b.recycle();
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable e) { return ""; }
    }

    private static double cpuTemp() {
        double best = -1;
        for (int i = 0; i < 60; i++) {
            String base = "/sys/class/thermal/thermal_zone" + i;
            if (!new File(base).exists()) { if (i > 5) break; else continue; }
            String type = readFile(base + "/type").toLowerCase(Locale.US);
            if (!(type.contains("cpu") || type.contains("soc") || type.contains("tsens") || type.contains("ap_therm") || type.contains("mtktscpu"))) continue;
            long v = readLong(base + "/temp");
            double t = v > 1000 ? v / 1000.0 : v;
            if (t > 15 && t < 125) best = Math.max(best, t);
        }
        return best;
    }

    private void scanDir(File dir, int depth, boolean inThumbs, File root) {
        if (depth > 14 || scanCount > 300000) return;
        File[] ch = dir.listFiles();
        if (ch == null) return;
        if (ch.length == 0) { if (depth >= 2) junk.get("empty").add(dir); return; }
        for (File f : ch) {
            if (f.isDirectory()) {
                String path = f.getAbsolutePath();
                if (path.equals(root.getAbsolutePath() + "/Android/data") || path.equals(root.getAbsolutePath() + "/Android/obb")) continue;
                String n = f.getName().toLowerCase(Locale.US);
                scanDir(f, depth + 1, inThumbs || n.equals(".thumbnails"), root);
            } else {
                scanCount++;
                String n = f.getName().toLowerCase(Locale.US);
                long len = f.length();
                if (inThumbs) junk.get("thumbs").add(f);
                else if (n.endsWith(".tmp") || n.endsWith(".temp") || n.endsWith(".log") || n.endsWith(".chk") || n.endsWith(".dmp") || n.startsWith("~$"))
                    junk.get("tmp").add(f);
                else if (n.endsWith(".apk") || n.endsWith(".xapk") || n.endsWith(".apks"))
                    junk.get("apks").add(f);
                if (len >= 100L * 1024 * 1024) largeFiles.add(f);
                long now = SystemClock.uptimeMillis();
                if (now - lastProg > 400) { lastProg = now; emit("scan", "{\"n\":" + scanCount + "}"); }
            }
        }
    }

    private JSONObject catJson(String k) throws Exception {
        long b = 0;
        for (File f : junk.get(k)) b += f.isFile() ? f.length() : 0;
        JSONObject o = new JSONObject();
        o.put("n", junk.get(k).size());
        o.put("b", b);
        return o;
    }

    private static int lpSize(Size s) { return s == null ? 0 : s.getWidth() * s.getHeight(); }

    // ------------------------------------------------------------------ puente JS

    public class Bridge {

        @JavascriptInterface
        public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
        }

        @JavascriptInterface
        public String deviceInfo() {
            JSONObject o = new JSONObject();
            try {
                o.put("manufacturer", Build.MANUFACTURER);
                o.put("brand", Build.BRAND);
                o.put("model", Build.MODEL);
                o.put("device", Build.DEVICE);
                o.put("product", Build.PRODUCT);
                o.put("board", Build.BOARD);
                o.put("hardware", Build.HARDWARE);
                o.put("marketName", marketName());
                o.put("release", Build.VERSION.RELEASE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("patch", Build.VERSION.SECURITY_PATCH);
                o.put("display", Build.DISPLAY);
                o.put("fingerprint", Build.FINGERPRINT);
                o.put("bootloader", Build.BOOTLOADER);
                o.put("abis", android.text.TextUtils.join(", ", Build.SUPPORTED_ABIS));
                o.put("rom", getprop("ro.build.version.emui").isEmpty()
                        ? (getprop("ro.miui.ui.version.name").isEmpty()
                        ? getprop("ro.build.version.oneui") : "MIUI/HyperOS " + getprop("ro.miui.ui.version.name"))
                        : getprop("ro.build.version.emui"));
                if (Build.VERSION.SDK_INT >= 31) {
                    o.put("socMfr", Build.SOC_MANUFACTURER);
                    o.put("socModel", Build.SOC_MODEL);
                }
                o.put("platform", getprop("ro.board.platform"));
                o.put("socProp", getprop("ro.soc.model"));
                o.put("cpuHw", cpuHardware());
                int cores = Runtime.getRuntime().availableProcessors();
                o.put("cores", cores);
                o.put("clusters", clusterSummary(cores));

                ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                o.put("ramTotal", mi.totalMem);
                o.put("ramAvail", mi.availMem);

                StatFs st = new StatFs(Environment.getDataDirectory().getPath());
                o.put("storTotal", st.getTotalBytes());
                o.put("storFree", st.getAvailableBytes());

                Display d = getWindowManager().getDefaultDisplay();
                DisplayMetrics dm = new DisplayMetrics();
                d.getRealMetrics(dm);
                o.put("wPx", dm.widthPixels);
                o.put("hPx", dm.heightPixels);
                o.put("dpi", dm.densityDpi);
                double inch = Math.sqrt(Math.pow(dm.widthPixels / dm.xdpi, 2) + Math.pow(dm.heightPixels / dm.ydpi, 2));
                o.put("inches", Math.round(inch * 10) / 10.0);
                float hz = d.getRefreshRate();
                for (Display.Mode m : d.getSupportedModes()) hz = Math.max(hz, m.getRefreshRate());
                o.put("maxHz", Math.round(hz));

                PackageManager pm = getPackageManager();
                String[][] feats = {
                        {"nfc", PackageManager.FEATURE_NFC}, {"bt", PackageManager.FEATURE_BLUETOOTH},
                        {"ble", PackageManager.FEATURE_BLUETOOTH_LE}, {"wifi", PackageManager.FEATURE_WIFI},
                        {"tel", PackageManager.FEATURE_TELEPHONY}, {"gps", PackageManager.FEATURE_LOCATION_GPS},
                        {"fingerprint", PackageManager.FEATURE_FINGERPRINT}, {"face", "android.hardware.biometrics.face"},
                        {"ir", PackageManager.FEATURE_CONSUMER_IR}, {"flash", PackageManager.FEATURE_CAMERA_FLASH},
                        {"camFront", PackageManager.FEATURE_CAMERA_FRONT}, {"camBack", PackageManager.FEATURE_CAMERA},
                        {"mic", PackageManager.FEATURE_MICROPHONE}, {"otg", PackageManager.FEATURE_USB_HOST},
                        {"proximity", PackageManager.FEATURE_SENSOR_PROXIMITY}, {"light", PackageManager.FEATURE_SENSOR_LIGHT},
                        {"gyro", PackageManager.FEATURE_SENSOR_GYROSCOPE}, {"compass", PackageManager.FEATURE_SENSOR_COMPASS},
                        {"baro", PackageManager.FEATURE_SENSOR_BAROMETER}, {"steps", PackageManager.FEATURE_SENSOR_STEP_COUNTER},
                        {"wifiDirect", PackageManager.FEATURE_WIFI_DIRECT}, {"wifiAware", "android.hardware.wifi.aware"},
                        {"uwb", "android.hardware.uwb"}, {"esim", "android.hardware.telephony.euicc"},
                        {"5g", "android.hardware.telephony.radio.access"}
                };
                JSONObject f = new JSONObject();
                for (String[] x : feats) f.put(x[0], pm.hasSystemFeature(x[1]));
                Vibrator vb = getVib();
                f.put("vibrator", vb != null && vb.hasVibrator());
                f.put("vibAmp", vb != null && Build.VERSION.SDK_INT >= 26 && vb.hasAmplitudeControl());
                f.put("telephonySlots", phoneCount());
                o.put("feat", f);
                o.put("rooted", isRooted());
                o.put("uptimeH", Math.round(SystemClock.elapsedRealtime() / 360000.0) / 10.0);
            } catch (Exception e) {
                try { o.put("err", e.toString()); } catch (Exception ignored) {}
            }
            return o.toString();
        }

        private int phoneCount() {
            try {
                TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
                return tm == null ? 0 : tm.getPhoneCount();
            } catch (Exception e) { return 0; }
        }

        @JavascriptInterface
        public String batteryDeep() {
            try {
                Intent st = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                return st == null ? "{}" : batteryJson(st, true).toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public String batteryInfo() {
            try {
                Intent st = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                return st == null ? "{}" : batteryJson(st).toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public String sensorsList() {
            JSONArray a = new JSONArray();
            try {
                for (Sensor s : sm.getSensorList(Sensor.TYPE_ALL)) {
                    JSONObject o = new JSONObject();
                    o.put("name", s.getName());
                    o.put("vendor", s.getVendor());
                    o.put("type", s.getType());
                    o.put("st", s.getStringType());
                    a.put(o);
                }
            } catch (Exception ignored) {}
            return a.toString();
        }

        @JavascriptInterface
        public String camerasInfo() {
            JSONArray a = new JSONArray();
            try {
                CameraManager cm = (CameraManager) getSystemService(CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    Integer f = ch.get(CameraCharacteristics.LENS_FACING);
                    o.put("facing", f == null ? -1 : f);
                    Size px = ch.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
                    o.put("mp", Math.round(lpSize(px) / 100000.0) / 10.0);
                    Boolean fl = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    o.put("flash", fl != null && fl);
                    float[] fls = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
                    if (fls != null && fls.length > 0) o.put("focal", fls[0]);
                    int[] ois = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
                    o.put("ois", ois != null && ois.length > 1);
                    a.put(o);
                }
            } catch (Exception ignored) {}
            return a.toString();
        }

        @JavascriptInterface
        public boolean hasPerm(String name) {
            for (String p : mapPerms(name)) if (!has(p)) return false;
            return true;
        }

        private List<String> mapPerms(String csv) {
            List<String> l = new ArrayList<String>();
            for (String n : csv.split(",")) {
                n = n.trim();
                if (n.equals("camera")) l.add(Manifest.permission.CAMERA);
                else if (n.equals("mic")) l.add(Manifest.permission.RECORD_AUDIO);
                else if (n.equals("storage")) {
                    l.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                    l.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                } else if (n.equals("location")) {
                    l.add(Manifest.permission.ACCESS_FINE_LOCATION);
                    l.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                }
            }
            return l;
        }

        @JavascriptInterface
        public void requestPerms(final String csv, final int id) {
            runOnUiThread(new Runnable() {
                public void run() {
                    List<String> need = new ArrayList<String>();
                    for (String p : mapPerms(csv)) if (!has(p)) need.add(p);
                    if (need.isEmpty()) emit("perm", "{\"id\":" + id + ",\"granted\":true}");
                    else requestPermissions(need.toArray(new String[0]), id);
                }
            });
        }

        @JavascriptInterface
        public void vibrate(String csv) {
            try {
                String[] p = csv.split(",");
                long[] pat = new long[p.length + 1];
                pat[0] = 0;
                for (int i = 0; i < p.length; i++) pat[i + 1] = Long.parseLong(p[i].trim());
                doVibrate(pat);
            } catch (Exception ignored) {}
        }

        /** Vibra y mide con el acelerómetro si el motor realmente se movió. Emite "vibcheck". */
        @JavascriptInterface
        public void vibrationCheck() {
            new Thread(new Runnable() {
                public void run() {
                    JSONObject o = new JSONObject();
                    HandlerThread ht = null;
                    SensorEventListener l = null;
                    try {
                        Vibrator v = getVib();
                        o.put("has", v != null && v.hasVibrator());
                        Sensor acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
                        if (acc == null) {
                            doVibrate(new long[]{0, 1200});
                            o.put("nosensor", true);
                            emit("vibcheck", o.toString());
                            return;
                        }
                        final double[][] buf = new double[2][4000];
                        final int[] cnt = new int[2];
                        final int[] phase = {-1};
                        l = new SensorEventListener() {
                            @Override
                            public void onSensorChanged(SensorEvent e) {
                                int ph = phase[0];
                                if (ph < 0 || ph > 1 || cnt[ph] >= 4000) return;
                                buf[ph][cnt[ph]++] = Math.sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2]);
                            }

                            @Override
                            public void onAccuracyChanged(Sensor s, int a) {}
                        };
                        ht = new HandlerThread("vibcheck");
                        ht.start();
                        sm.registerListener(l, acc, SensorManager.SENSOR_DELAY_FASTEST, new Handler(ht.getLooper()));
                        Thread.sleep(250);
                        phase[0] = 0;               // reposo
                        Thread.sleep(800);
                        phase[0] = 2;
                        doVibrate(new long[]{0, 1600});
                        Thread.sleep(300);
                        phase[0] = 1;               // vibrando
                        Thread.sleep(1100);
                        phase[0] = 2;
                        sm.unregisterListener(l);
                        l = null;
                        double b = std(buf[0], cnt[0]), x = std(buf[1], cnt[1]);
                        o.put("base", Math.round(b * 1000) / 1000.0);
                        o.put("vib", Math.round(x * 1000) / 1000.0);
                        o.put("n", cnt[0] + cnt[1]);
                        o.put("ratio", b > 0 ? Math.round(x / b * 10) / 10.0 : 99);
                        o.put("detected", cnt[1] > 5 && x > 0.035 && x > b * 2.2);
                    } catch (Exception e) {
                        try { o.put("err", e.toString()); } catch (Exception ignored) {}
                    } finally {
                        if (l != null) sm.unregisterListener(l);
                        if (ht != null) ht.quitSafely();
                    }
                    emit("vibcheck", o.toString());
                }
            }).start();
        }

        @JavascriptInterface
        public void openVibrationSettings() {
            try {
                Intent i = new Intent(Settings.ACTION_SOUND_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean torch(boolean on) {
            try { torchSet(on); return true; } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void setBrightness(final float v) {
            runOnUiThread(new Runnable() {
                public void run() {
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = v < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(0.01f, Math.min(1f, v));
                    getWindow().setAttributes(lp);
                }
            });
        }

        @JavascriptInterface
        public void keyCapture(boolean on) { keyCapture = on; }

        @JavascriptInterface
        public void tone(final String route, final int ms) {
            new Thread(new Runnable() {
                public void run() { playTone("earpiece".equals(route), Math.max(300, Math.min(ms, 6000))); }
            }).start();
        }

        @JavascriptInterface
        public boolean micStart(int source) {
            micStop();
            if (!has(Manifest.permission.RECORD_AUDIO)) return false;
            final int sr = 16000;
            int min = AudioRecord.getMinBufferSize(sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            final AudioRecord rec;
            try {
                rec = new AudioRecord(source, sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, 4096) * 2);
                if (rec.getState() != AudioRecord.STATE_INITIALIZED) { rec.release(); return false; }
                rec.startRecording();
            } catch (Exception e) { return false; }
            recOn = true;
            micLvl = 0;
            recThread = new Thread(new Runnable() {
                public void run() {
                    short[] buf = new short[1024];
                    while (recOn) {
                        int n = rec.read(buf, 0, buf.length);
                        if (n > 0) {
                            double s = 0;
                            for (int i = 0; i < n; i++) s += (double) buf[i] * buf[i];
                            double rms = Math.sqrt(s / n) / 32768.0;
                            micLvl = (float) Math.min(1.0, rms * 8);
                        }
                    }
                    try { rec.stop(); } catch (Exception ignored) {}
                    rec.release();
                }
            });
            recThread.start();
            return true;
        }

        @JavascriptInterface
        public float micLevel() { return micLvl; }

        @JavascriptInterface
        public void micStop() {
            recOn = false;
            Thread t = recThread;
            recThread = null;
            if (t != null) try { t.join(400); } catch (InterruptedException ignored) {}
            micLvl = 0;
        }

        @JavascriptInterface
        public boolean sensorStart(int type) {
            Sensor s = sm.getDefaultSensor(type);
            if (s == null) return false;
            if (sensorL == null) {
                sensorL = new SensorEventListener() {
                    @Override
                    public void onSensorChanged(SensorEvent e) {
                        int t = e.sensor.getType();
                        long now = SystemClock.uptimeMillis();
                        int k = t & 127;
                        if (t != Sensor.TYPE_PROXIMITY && now - lastEmit[k] < 70) return;
                        lastEmit[k] = now;
                        StringBuilder sb = new StringBuilder("{\"t\":").append(t).append(",\"max\":")
                                .append(e.sensor.getMaximumRange()).append(",\"v\":[");
                        int n = Math.min(e.values.length, 4);
                        for (int i = 0; i < n; i++) {
                            float v = e.values[i];
                            if (Float.isNaN(v) || Float.isInfinite(v)) v = 0;
                            if (i > 0) sb.append(',');
                            sb.append(v);
                        }
                        sb.append("]}");
                        emit("sensor", sb.toString());
                    }

                    @Override
                    public void onAccuracyChanged(Sensor s, int a) {}
                };
            }
            return sm.registerListener(sensorL, s, SensorManager.SENSOR_DELAY_GAME);
        }

        @JavascriptInterface
        public void sensorStop() {
            try { if (sensorL != null) sm.unregisterListener(sensorL); } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String gpsStart() {
            if (lm == null || !getPackageManager().hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS)) return "nogps";
            if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) return "noperm";
            if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) return "disabled";
            main.post(new Runnable() {
                public void run() {
                    gpsStopInternal();
                    try {
                        locL = new LocationListener() {
                            @Override
                            public void onLocationChanged(Location l) {
                                emit("gps", "{\"acc\":" + Math.round(l.getAccuracy()) + "}");
                            }

                            @Override
                            public void onStatusChanged(String p, int s, Bundle b) {}

                            @Override
                            public void onProviderEnabled(String p) {}

                            @Override
                            public void onProviderDisabled(String p) { emit("gps", "{\"disabled\":true}"); }
                        };
                        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, locL, Looper.getMainLooper());
                        if (Build.VERSION.SDK_INT >= 24) {
                            GnssStatus.Callback cb = new GnssStatus.Callback() {
                                @Override
                                public void onSatelliteStatusChanged(GnssStatus st) {
                                    int n = st.getSatelliteCount(), used = 0;
                                    float best = 0;
                                    float[] cn = new float[n];
                                    for (int i = 0; i < n; i++) {
                                        if (st.usedInFix(i)) used++;
                                        cn[i] = st.getCn0DbHz(i);
                                        best = Math.max(best, cn[i]);
                                    }
                                    java.util.Arrays.sort(cn);
                                    float avg = 0;
                                    int k = Math.min(4, n);
                                    for (int i = 0; i < k; i++) avg += cn[n - 1 - i];
                                    if (k > 0) avg /= k;
                                    emit("gnss", "{\"n\":" + n + ",\"used\":" + used + ",\"cn0\":" + Math.round(avg) + "}");
                                }
                            };
                            gnssCb = cb;
                            lm.registerGnssStatusCallback(cb, main);
                        }
                    } catch (SecurityException e) {
                        emit("gps", "{\"err\":\"perm\"}");
                    } catch (Exception e) {
                        emit("gps", "{\"err\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
                    }
                }
            });
            return "ok";
        }

        @JavascriptInterface
        public void gpsStop() {
            main.post(new Runnable() { public void run() { gpsStopInternal(); } });
        }

        @JavascriptInterface
        public String wifiInfo() {
            JSONObject o = new JSONObject();
            try {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                o.put("has", wm != null);
                if (wm == null) return o.toString();
                o.put("enabled", wm.isWifiEnabled());
                o.put("band5", wm.is5GHzBandSupported());
                boolean wifi = false, cell = false, valid = false;
                Network n = cm.getActiveNetwork();
                if (n != null) {
                    NetworkCapabilities c = cm.getNetworkCapabilities(n);
                    if (c != null) {
                        wifi = c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
                        cell = c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
                        valid = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                        o.put("down", c.getLinkDownstreamBandwidthKbps());
                    }
                }
                o.put("wifi", wifi);
                o.put("cell", cell);
                o.put("internet", valid);
                WifiInfo wi = wm.getConnectionInfo();
                if (wi != null && wi.getNetworkId() != -1) {
                    o.put("rssi", wi.getRssi());
                    o.put("link", wi.getLinkSpeed());
                    o.put("freq", wi.getFrequency());
                    o.put("level", WifiManager.calculateSignalLevel(wi.getRssi(), 5));
                }
            } catch (Exception e) {
                try { o.put("err", e.toString()); } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public String btInfo() {
            JSONObject o = new JSONObject();
            try {
                o.put("has", getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH));
                BluetoothManager bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
                BluetoothAdapter a = bm == null ? null : bm.getAdapter();
                o.put("enabled", a != null && a.isEnabled());
            } catch (Exception e) {
                try { o.put("err", e.toString()); } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public String nfcInfo() {
            JSONObject o = new JSONObject();
            try {
                NfcAdapter a = NfcAdapter.getDefaultAdapter(DiagActivity.this);
                o.put("has", a != null);
                o.put("enabled", a != null && a.isEnabled());
            } catch (Exception ignored) {}
            return o.toString();
        }

        @JavascriptInterface
        public String simInfo() {
            JSONObject o = new JSONObject();
            try {
                TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
                o.put("tel", getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY) && tm != null);
                if (tm == null) return o.toString();
                int slots = tm.getPhoneCount();
                o.put("slots", slots);
                JSONArray st = new JSONArray();
                for (int i = 0; i < slots; i++) st.put(Build.VERSION.SDK_INT >= 26 ? tm.getSimState(i) : (i == 0 ? tm.getSimState() : 0));
                o.put("states", st);
                o.put("op", tm.getSimOperatorName());
                o.put("net", tm.getNetworkOperatorName());
                o.put("iso", tm.getSimCountryIso());
                if (Build.VERSION.SDK_INT >= 28) {
                    SignalStrength ss = tm.getSignalStrength();
                    if (ss != null) o.put("level", ss.getLevel());
                }
            } catch (Exception e) {
                try { o.put("err", e.toString()); } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public String audioOutputs() {
            JSONArray a = new JSONArray();
            try {
                AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) a.put(d.getType());
            } catch (Exception ignored) {}
            return a.toString();
        }

        @JavascriptInterface
        public void storageTest() {
            new Thread(new Runnable() {
                public void run() {
                    JSONObject o = new JSONObject();
                    File f = new File(getCacheDir(), "mv_speed.bin");
                    try {
                        byte[] buf = new byte[1 << 20];
                        new Random().nextBytes(buf);
                        int mb = 64;
                        long t0 = System.nanoTime();
                        FileOutputStream out = new FileOutputStream(f);
                        for (int i = 0; i < mb; i++) out.write(buf);
                        out.getFD().sync();
                        out.close();
                        double w = mb / ((System.nanoTime() - t0) / 1e9);
                        o.put("write", Math.round(w));
                        StatFs st = new StatFs(Environment.getDataDirectory().getPath());
                        o.put("total", st.getTotalBytes());
                        o.put("free", st.getAvailableBytes());
                    } catch (Exception e) {
                        try { o.put("err", e.toString()); } catch (Exception ignored) {}
                    } finally {
                        //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    }
                    emit("storage", o.toString());
                }
            }).start();
        }

        @JavascriptInterface
        public void cpuTest() {
            new Thread(new Runnable() {
                public void run() {
                    JSONObject o = new JSONObject();
                    try {
                        Intent b0 = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                        double t0 = b0 == null ? -1 : b0.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -10) / 10.0;
                        final int cores = Runtime.getRuntime().availableProcessors();
                        final long[] counts = new long[cores];
                        final long end = SystemClock.uptimeMillis() + 2500;
                        Thread[] th = new Thread[cores];
                        for (int c = 0; c < cores; c++) {
                            final int idx = c;
                            th[c] = new Thread(new Runnable() {
                                public void run() {
                                    long n = 0;
                                    double x = 1.0001;
                                    while (SystemClock.uptimeMillis() < end) {
                                        for (int i = 0; i < 20000; i++) { x = x * 1.0000001 + Math.sqrt(i + x) * 1e-9; }
                                        n++;
                                    }
                                    counts[idx] = n + (x > 1e300 ? 1 : 0);
                                }
                            });
                            th[c].start();
                        }
                        long total = 0, best = 0;
                        for (int c = 0; c < cores; c++) { th[c].join(); total += counts[c]; best = Math.max(best, counts[c]); }
                        Intent b1 = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                        double t1 = b1 == null ? -1 : b1.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -10) / 10.0;
                        o.put("multi", total);
                        o.put("single", best);
                        o.put("cores", cores);
                        o.put("t0", t0);
                        o.put("t1", t1);
                    } catch (Exception e) {
                        try { o.put("err", e.toString()); } catch (Exception ignored) {}
                    }
                    emit("cpu", o.toString());
                }
            }).start();
        }

        @JavascriptInterface
        public String bioStatus() {
            try {
                PackageManager pm = getPackageManager();
                boolean fp = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
                boolean face = pm.hasSystemFeature("android.hardware.biometrics.face");
                if (Build.VERSION.SDK_INT >= 29) {
                    BiometricManager bm = (BiometricManager) getSystemService(BiometricManager.class);
                    int r = Build.VERSION.SDK_INT >= 30 ? bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) : bm.canAuthenticate();
                    if (r == BiometricManager.BIOMETRIC_SUCCESS) return "ok";
                    if (r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return "none_enrolled";
                    if (r == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) return (fp || face) ? "unavailable" : "no_hw";
                    return "unavailable";
                }
                if (!fp) return "no_hw";
                FingerprintManager fm = (FingerprintManager) getSystemService(FingerprintManager.class);
                if (fm == null || !fm.isHardwareDetected()) return "unavailable";
                if (!fm.hasEnrolledFingerprints()) return "none_enrolled";
                return Build.VERSION.SDK_INT >= 28 ? "ok" : "manual";
            } catch (Exception e) {
                return "manual";
            }
        }

        @JavascriptInterface
        public void biometric() {
            if (Build.VERSION.SDK_INT < 28) { emit("bio", "{\"err\":\"old\"}"); return; }
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        bioCancel = new CancellationSignal();
                        BiometricPrompt p = new BiometricPrompt.Builder(DiagActivity.this)
                                .setTitle("Prueba de huella / rostro")
                                .setSubtitle("Usa tu huella o tu rostro registrado")
                                .setNegativeButton("Cancelar", getMainExecutor(), new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface d, int w) { emit("bio", "{\"cancel\":true}"); }
                                }).build();
                        p.authenticate(bioCancel, getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                                emit("bio", "{\"ok\":true}");
                            }

                            @Override
                            public void onAuthenticationFailed() {
                                emit("bio", "{\"miss\":true}");
                            }

                            @Override
                            public void onAuthenticationError(int code, CharSequence msg) {
                                emit("bio", "{\"err\":" + JSONObject.quote(String.valueOf(msg)) + ",\"code\":" + code + "}");
                            }
                        });
                    } catch (Exception e) {
                        emit("bio", "{\"err\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
                    }
                }
            });
        }

        @JavascriptInterface
        public void openSettings(String which) {
            String a;
            if ("wifi".equals(which)) a = Settings.ACTION_WIFI_SETTINGS;
            else if ("bt".equals(which)) a = Settings.ACTION_BLUETOOTH_SETTINGS;
            else if ("nfc".equals(which)) a = Settings.ACTION_NFC_SETTINGS;
            else if ("location".equals(which)) a = Settings.ACTION_LOCATION_SOURCE_SETTINGS;
            else if ("security".equals(which)) a = Settings.ACTION_SECURITY_SETTINGS;
            else if ("data".equals(which)) a = Settings.ACTION_DATA_ROAMING_SETTINGS;
            else if ("app".equals(which)) a = Settings.ACTION_APPLICATION_DETAILS_SETTINGS;
            else if ("storage".equals(which)) a = Settings.ACTION_INTERNAL_STORAGE_SETTINGS;
            else if ("saver".equals(which)) a = Settings.ACTION_BATTERY_SAVER_SETTINGS;
            else if ("dev".equals(which)) a = Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS;
            else if ("usage".equals(which)) a = Settings.ACTION_USAGE_ACCESS_SETTINGS;
            else if ("write".equals(which)) a = Settings.ACTION_MANAGE_WRITE_SETTINGS;
            else if ("battery".equals(which)) a = Intent.ACTION_POWER_USAGE_SUMMARY;
            else a = Settings.ACTION_SETTINGS;
            try {
                Intent i = new Intent(a);
                if ("app".equals(which) || "write".equals(which)) i.setData(Uri.parse("package:" + getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {
                try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void share(String text) {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                Intent c = Intent.createChooser(i, "Compartir informe");
                c.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(c);
            } catch (Exception ignored) {}
        }

        // ------------------------------------------------------------------ optimización

        @JavascriptInterface
        public String sysStatus() {
            JSONObject o = new JSONObject();
            try {
                ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                o.put("ramTotal", mi.totalMem);
                o.put("ramAvail", mi.availMem);
                o.put("lowMem", mi.lowMemory);
                StatFs st = new StatFs(Environment.getDataDirectory().getPath());
                o.put("storTotal", st.getTotalBytes());
                o.put("storFree", st.getAvailableBytes());
                Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (b != null) {
                    o.put("temp", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1000) / 10.0);
                    o.put("plugged", b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0));
                }
                double ct = cpuTemp();
                if (ct > 0) o.put("cpuTemp", Math.round(ct * 10) / 10.0);
                if (Build.VERSION.SDK_INT >= 29) {
                    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                    o.put("thermal", pm.getCurrentThermalStatus());
                    o.put("saver", pm.isPowerSaveMode());
                    if (Build.VERSION.SDK_INT >= 30) {
                        float h = pm.getThermalHeadroom(10);
                        if (!Float.isNaN(h)) o.put("headroom", Math.round(h * 100) / 100.0);
                    }
                }
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("allFiles", allFilesAccess());
                o.put("usage", usageAccess());
                o.put("writeSettings", Settings.System.canWrite(DiagActivity.this));
                try {
                    o.put("anim", Settings.Global.getFloat(getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f));
                } catch (Exception ignored) {}
            } catch (Exception e) {
                try { o.put("err", e.toString()); } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public void ramBoost() {
            new Thread(new Runnable() {
                public void run() {
                    JSONObject o = new JSONObject();
                    try {
                        ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
                        ActivityManager.MemoryInfo m1 = new ActivityManager.MemoryInfo();
                        am.getMemoryInfo(m1);
                        int n = 0;
                        for (ApplicationInfo a : getPackageManager().getInstalledApplications(0)) {
                            if (a.packageName.equals(getPackageName())) continue;
                            try { am.killBackgroundProcesses(a.packageName); n++; } catch (Exception ignored) {}
                        }
                        deleteChildren(getCacheDir());
                        System.gc();
                        Thread.sleep(1500);
                        ActivityManager.MemoryInfo m2 = new ActivityManager.MemoryInfo();
                        am.getMemoryInfo(m2);
                        o.put("before", m1.availMem);
                        o.put("after", m2.availMem);
                        o.put("total", m2.totalMem);
                        o.put("apps", n);
                        o.put("limited", Build.VERSION.SDK_INT >= 34);
                    } catch (Exception e) {
                        try { o.put("err", e.toString()); } catch (Exception ignored) {}
                    }
                    emit("boost", o.toString());
                }
            }).start();
        }

        @JavascriptInterface
        public String clearCache() {
            try { deleteChildren(getCacheDir()); } catch (Exception ignored) {}
            runOnUiThread(new Runnable() { public void run() { if (web != null) web.clearCache(true); } });
            cacheFreeBefore = freeBytes();
            if (Build.VERSION.SDK_INT >= 30) {
                if (!Environment.isExternalStorageManager()) return "needperm";
                runOnUiThread(new Runnable() {
                    public void run() {
                        try {
                            startActivityForResult(new Intent(StorageManager.ACTION_CLEAR_APP_CACHE), REQ_CACHE);
                        } catch (Exception e) {
                            emit("cache", "{\"err\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
                        }
                    }
                });
                return "dialog";
            }
            openSettings("storage");
            return "settings";
        }

        @JavascriptInterface
        public void requestAllFiles() {
            if (Build.VERSION.SDK_INT >= 30) {
                try {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception e) {
                    try { startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
                }
            } else {
                requestPerms("storage", 850);
            }
        }

        @JavascriptInterface
        public void junkScan() {
            if (scanning) return;
            if (!allFilesAccess()) { emit("junk", "{\"needperm\":true}"); return; }
            scanning = true;
            new Thread(new Runnable() {
                public void run() {
                    JSONObject o = new JSONObject();
                    try {
                        synchronized (junk) {
                            junk.clear();
                            junk.put("tmp", new ArrayList<File>());
                            junk.put("thumbs", new ArrayList<File>());
                            junk.put("apks", new ArrayList<File>());
                            junk.put("empty", new ArrayList<File>());
                            largeFiles.clear();
                            scanCount = 0;
                            File root = Environment.getExternalStorageDirectory();
                            long t0 = SystemClock.uptimeMillis();
                            scanDir(root, 0, false, root);
                            Collections.sort(largeFiles, new Comparator<File>() {
                                public int compare(File a, File b) { return Long.compare(b.length(), a.length()); }
                            });
                            while (largeFiles.size() > 60) largeFiles.remove(largeFiles.size() - 1);
                            o.put("tmp", catJson("tmp"));
                            o.put("thumbs", catJson("thumbs"));
                            o.put("apks", catJson("apks"));
                            o.put("empty", catJson("empty"));
                            JSONArray apkNames = new JSONArray();
                            for (File f : junk.get("apks")) { if (apkNames.length() < 20) apkNames.put(f.getName()); }
                            o.put("apkNames", apkNames);
                            JSONArray big = new JSONArray();
                            String rp = root.getAbsolutePath();
                            for (File f : largeFiles) {
                                JSONObject x = new JSONObject();
                                x.put("p", f.getAbsolutePath().replace(rp, ""));
                                x.put("s", f.length());
                                x.put("m", f.lastModified());
                                big.put(x);
                            }
                            o.put("large", big);
                            o.put("scanned", scanCount);
                            o.put("ms", SystemClock.uptimeMillis() - t0);
                        }
                    } catch (Exception e) {
                        try { o.put("err", e.toString()); } catch (Exception ignored) {}
                    }
                    scanning = false;
                    emit("junk", o.toString());
                }
            }).start();
        }

        @JavascriptInterface
        public void junkClean(final String csv) {
            new Thread(new Runnable() {
                public void run() {
                    long bytes = 0; int n = 0;
                    synchronized (junk) {
                        for (String k : csv.split(",")) {
                            List<File> l = junk.get(k.trim());
                            if (l == null) continue;
                            for (File f : l) {
                                if (f.isDirectory()) {
                                    String[] c = f.list();
                                    if (c != null && c.length == 0 && f.delete()) n++;
                                } else {
                                    long len = f.length();
                                    if (f.delete()) { bytes += len; n++; }
                                }
                            }
                            l.clear();
                        }
                    }
                    emit("clean", "{\"n\":" + n + ",\"b\":" + bytes + "}");
                }
            }).start();
        }

        @JavascriptInterface
        public void deleteLarge(final String idxCsv) {
            new Thread(new Runnable() {
                public void run() {
                    long bytes = 0; int n = 0;
                    synchronized (junk) {
                        List<File> del = new ArrayList<File>();
                        for (String s : idxCsv.split(",")) {
                            try {
                                int k = Integer.parseInt(s.trim());
                                if (k >= 0 && k < largeFiles.size()) del.add(largeFiles.get(k));
                            } catch (Exception ignored) {}
                        }
                        for (File f : del) { long len = f.length(); if (f.delete()) { bytes += len; n++; } }
                        largeFiles.removeAll(del);
                    }
                    emit("clean", "{\"n\":" + n + ",\"b\":" + bytes + ",\"large\":true}");
                }
            }).start();
        }

        @JavascriptInterface
        public void appsScan() {
            new Thread(new Runnable() {
                public void run() {
                    JSONObject o = new JSONObject();
                    try {
                        boolean usage = usageAccess();
                        o.put("usage", usage);
                        PackageManager pm = getPackageManager();
                        Map<String, Long> last = new HashMap<String, Long>();
                        long now = System.currentTimeMillis();
                        if (usage) {
                            UsageStatsManager um = (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
                            Map<String, UsageStats> m = um.queryAndAggregateUsageStats(now - 120L * 86400000L, now);
                            for (Map.Entry<String, UsageStats> e : m.entrySet()) last.put(e.getKey(), e.getValue().getLastTimeUsed());
                        }
                        StorageStatsManager ssm = (usage && Build.VERSION.SDK_INT >= 26) ? (StorageStatsManager) getSystemService(STORAGE_STATS_SERVICE) : null;
                        JSONArray arr = new JSONArray();
                        for (ApplicationInfo a : pm.getInstalledApplications(0)) {
                            boolean sys = (a.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (a.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
                            if (sys || a.packageName.equals(getPackageName()) || pm.getLaunchIntentForPackage(a.packageName) == null) continue;
                            JSONObject x = new JSONObject();
                            x.put("pkg", a.packageName);
                            x.put("name", String.valueOf(pm.getApplicationLabel(a)));
                            Long lu = last.get(a.packageName);
                            x.put("last", lu == null ? 0 : lu);
                            try { x.put("inst", pm.getPackageInfo(a.packageName, 0).firstInstallTime); } catch (Exception ignored) {}
                            if (ssm != null) {
                                try {
                                    StorageStats ss = ssm.queryStatsForPackage(a.storageUuid, a.packageName, Process.myUserHandle());
                                    x.put("size", ss.getAppBytes() + ss.getDataBytes());
                                    x.put("cache", ss.getCacheBytes());
                                } catch (Exception ignored) {}
                            }
                            x.put("icon", b64Icon(pm.getApplicationIcon(a), 72));
                            arr.put(x);
                        }
                        o.put("apps", arr);
                    } catch (Exception e) {
                        try { o.put("err", e.toString()); } catch (Exception ignored) {}
                    }
                    emit("apps", o.toString());
                }
            }).start();
        }

        @JavascriptInterface
        public void uninstall(String pkg) {
            try {
                Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void openAppInfo(String pkg) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean setSystemBrightness(int pct) {
            try {
                if (!Settings.System.canWrite(DiagActivity.this)) return false;
                Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, Math.max(10, Math.min(255, pct * 255 / 100)));
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void openUrl(String url) { openExternal(url); }
    }
}
