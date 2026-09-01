package org.zehlzeh.volunteer;

import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import org.zehlzeh.labelprint.LabelPrintPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Register the in-app LabelPrint plugin (raw TCP print to the LAN
        // TSC printer). Bundled with the APK, so it's available on both
        // the org.zehlzeh.volunteer AND org.zehlzeh.kiosk builds.
        registerPlugin(LabelPrintPlugin.class);
        // Task #176 (Aug 14): kiosk lock-task bridge — JS calls
        // KioskLock.startLockTask() when kiosk mode is on; unbreakable when
        // the tablet is provisioned as device owner (adb dpm set-device-owner).
        registerPlugin(KioskLockPlugin.class);
        super.onCreate(savedInstanceState);
        // Aug 14 client: kiosk tablet must stay on 24/7 parked at the sign-in
        // screen. FLAG_KEEP_SCREEN_ON keeps the display awake while our
        // activity is in the foreground — no user gesture required, survives
        // OS aggressive-battery policies. The idle-return-to-welcome timer
        // (KioskApp.tsx) still fires so the screen shows the fresh sign-in
        // prompt after any drop-off flow.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
