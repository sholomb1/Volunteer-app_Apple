package org.zehlzeh.volunteer;

import com.getcapacitor.BridgeActivity;
import org.zehlzeh.labelprint.LabelPrintPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Register the in-app LabelPrint plugin (raw TCP print to the LAN
        // TSC printer). Bundled with the APK, so it's available on both
        // the org.zehlzeh.volunteer AND org.zehlzeh.kiosk builds.
        registerPlugin(LabelPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
