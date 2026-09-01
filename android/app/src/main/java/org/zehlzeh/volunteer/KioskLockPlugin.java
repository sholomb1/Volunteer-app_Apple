package org.zehlzeh.volunteer;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Task #176 (Aug 14): true Android kiosk lockdown. Exposes three methods to
 * the JS runtime:
 *
 *   isDeviceOwner()  → { deviceOwner: bool, locked: bool }
 *   startLockTask()  → { started: bool, reason?: string }
 *   stopLockTask()   → { stopped: bool }
 *
 * Called from KioskApp.tsx: on mount, if native + kiosk mode is on,
 * startLockTask() runs so the volunteer can't swipe out. Exit Kiosk in the
 * PIN-gated Admin Panel calls stopLockTask() before clearing kiosk-mode.
 */
@CapacitorPlugin(name = "KioskLock")
public class KioskLockPlugin extends Plugin {
    private static final String TAG = "KioskLock";

    private DevicePolicyManager dpm() {
        return (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    private ActivityManager am() {
        return (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
    }

    private boolean isDeviceOwnerInternal() {
        try {
            DevicePolicyManager d = dpm();
            String pkg = getContext().getPackageName();
            return d != null && d.isDeviceOwnerApp(pkg);
        } catch (Exception e) {
            Log.w(TAG, "isDeviceOwner check failed", e);
            return false;
        }
    }

    private int lockTaskModeState() {
        ActivityManager a = am();
        if (a == null) return ActivityManager.LOCK_TASK_MODE_NONE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return a.getLockTaskModeState();
        }
        // Older devices: fall back to boolean isInLockTaskMode via reflection.
        return a.isInLockTaskMode() ? ActivityManager.LOCK_TASK_MODE_LOCKED
                                    : ActivityManager.LOCK_TASK_MODE_NONE;
    }

    @PluginMethod
    public void isDeviceOwner(PluginCall call) {
        JSObject r = new JSObject();
        r.put("deviceOwner", isDeviceOwnerInternal());
        r.put("locked", lockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE);
        call.resolve(r);
    }

    @PluginMethod
    public void startLockTask(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("no_activity");
            return;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                JSObject r = new JSObject();
                try {
                    // If we're device-owner, whitelist ourselves so lock-task
                    // is silent and unbreakable. Without device-owner we can
                    // still call startLockTask() but the user gets an "App is
                    // pinned. To unpin, hold Back + Overview" prompt and can
                    // exit — same behaviour as manual Screen Pinning.
                    if (isDeviceOwnerInternal()) {
                        try {
                            DevicePolicyManager d = dpm();
                            ComponentName admin = KioskDeviceAdminReceiver.getComponentName(getContext());
                            String[] pkgs = new String[] { getContext().getPackageName() };
                            d.setLockTaskPackages(admin, pkgs);
                        } catch (SecurityException se) {
                            Log.w(TAG, "setLockTaskPackages denied", se);
                        }
                    }
                    activity.startLockTask();
                    r.put("started", true);
                    r.put("deviceOwner", isDeviceOwnerInternal());
                    call.resolve(r);
                } catch (Throwable t) {
                    Log.w(TAG, "startLockTask failed", t);
                    r.put("started", false);
                    r.put("reason", t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName());
                    call.resolve(r);
                }
            }
        });
    }

    @PluginMethod
    public void stopLockTask(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("no_activity");
            return;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                JSObject r = new JSObject();
                try {
                    if (lockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) {
                        activity.stopLockTask();
                    }
                    r.put("stopped", true);
                    call.resolve(r);
                } catch (Throwable t) {
                    Log.w(TAG, "stopLockTask failed", t);
                    r.put("stopped", false);
                    r.put("reason", t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName());
                    call.resolve(r);
                }
            }
        });
    }
}
