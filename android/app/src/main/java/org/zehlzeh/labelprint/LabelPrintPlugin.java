/**
 * Capacitor plugin — raw TCP print for TSC label printers on the LAN.
 *
 * Kiosk JS side:
 *   import { registerPlugin } from '@capacitor/core';
 *   const LabelPrint = registerPlugin('LabelPrint');
 *   await LabelPrint.printTspl({ host: '192.168.1.210', port: 9100, bytes: '<base64>' });
 *
 * The APK opens a TCP socket to <host>:<port>, writes the raw TSPL bytes,
 * flushes, and closes. No dialogs, no Android Print Service involved.
 */
package org.zehlzeh.labelprint;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

@CapacitorPlugin(name = "LabelPrint")
public class LabelPrintPlugin extends Plugin {

    @PluginMethod
    public void printTspl(PluginCall call) {
        final String host    = call.getString("host");
        final Integer port   = call.getInt("port", 9100);
        final String bytesB64 = call.getString("bytes");

        if (host == null || host.isEmpty() || bytesB64 == null) {
            call.reject("host + bytes required");
            return;
        }

        final byte[] payload;
        try {
            payload = Base64.decode(bytesB64, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("invalid base64: " + e.getMessage());
            return;
        }

        // Do the socket work off the main thread — Android will refuse
        // NetworkOnMainThreadException otherwise.
        new Thread(() -> {
            Socket sock = null;
            try {
                sock = new Socket();
                sock.connect(new InetSocketAddress(host, port), 5000);
                sock.setSoTimeout(5000);
                OutputStream out = sock.getOutputStream();
                out.write(payload);
                out.flush();
                // Give the printer a beat to buffer before closing.
                try { Thread.sleep(120); } catch (InterruptedException ignored) {}
                out.close();
                sock.close();
                JSObject res = new JSObject();
                res.put("sent",  payload.length);
                res.put("host",  host);
                res.put("port",  port);
                call.resolve(res);
            } catch (Exception e) {
                try { if (sock != null) sock.close(); } catch (Exception ignored) {}
                call.reject("tcp print failed: " + e.getMessage());
            }
        }, "LabelPrint-tcp").start();
    }
}
