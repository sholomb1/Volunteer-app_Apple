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
                // Chunked write with per-chunk drain — writing a big
                // multi-label payload in one shot fills the TSC's TCP
                // receive buffer and the printer silently drops the tail.
                // 8KB chunks + a small sleep between chunks lets the
                // printer feed each label out before the next chunk lands.
                // TSC TDP-244 at speed 4 feeds a ~3" label in ~700ms; each
                // label bitmap is ~45KB → ~6 chunks per label × 60ms = ~360ms
                // of inter-chunk pauses per label, well under the actual
                // feed time so we never starve the printer.
                // Chunk larger and pause less — printer at SPEED 6 (6"/sec)
                // eats bytes faster than we can generate them, so we don't
                // need the earlier long pauses. 16KB chunks + 20ms pauses
                // keeps the TCP receive buffer trickled without stalling.
                final int CHUNK = 16 * 1024;
                for (int i = 0; i < payload.length; i += CHUNK) {
                    int end = Math.min(i + CHUNK, payload.length);
                    out.write(payload, i, end - i);
                    out.flush();
                    if (end < payload.length) {
                        try { Thread.sleep(20); } catch (InterruptedException ignored) {}
                    }
                }
                // Final drain — kept short (200ms) so the socket-close
                // doesn't sit around after the last chunk landed.
                try { Thread.sleep(200); } catch (InterruptedException ignored) {}
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
