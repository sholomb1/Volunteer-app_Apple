package org.zehlzeh.volunteer;

import android.app.admin.DeviceAdminReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/**
 * Device-Owner receiver for the true "impossible to escape" kiosk mode
 * (task #176). After the tablet is provisioned via:
 *
 *   adb shell dpm set-device-owner org.zehlzeh.volunteer/.KioskDeviceAdminReceiver
 *
 * this app can call setLockTaskPackages(...) + startLockTask() without a
 * user gesture. Escape is only possible via the PIN-gated Admin Panel that
 * calls stopLockTask() before clearing kiosk-mode.
 */
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {
    public static ComponentName getComponentName(Context ctx) {
        return new ComponentName(ctx.getApplicationContext(), KioskDeviceAdminReceiver.class);
    }

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
    }
}
