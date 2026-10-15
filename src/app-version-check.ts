/**
 * Oct 14 client: phone-app "a newer version is in the store" check.
 *
 * The web build publishes /rescue/version.json ({ versionCode, versionName, builtAt },
 * see vite.config.ts). The phone app reads it from the live site. fetch() in the
 * app goes through Capacitor's native HTTP (CapacitorHttp), so internet filters
 * that block the WebView don't block this check.
 *
 * The live site gets the new number as soon as it goes live, but the stores need a
 * few days to approve the new app -- so the banner only shows once the live site has
 * been newer than this app for STORE_DELAY_MS (counted on this phone).
 */
export const REMOTE_VERSION_URL = 'https://staging.zehlzeh.org/rescue/version.json';
export const STORE_DELAY_MS = 3 * 86400e3;
const SEEN_KEY = 'zlz_newer_app_seen_at';

export type RemoteAppVersion = { versionCode: number; versionName: string; builtAt: string };

export async function fetchRemoteAppVersion(): Promise<RemoteAppVersion | null> {
  try {
    const r = await fetch(`${REMOTE_VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const code = Number(j?.versionCode);
    if (!Number.isFinite(code) || code <= 0) return null;
    return { versionCode: code, versionName: String(j?.versionName ?? ''), builtAt: String(j?.builtAt ?? '') };
  } catch { return null; }
}

/** Pure decision: newer on the live site, and first seen long enough ago. */
export function updateDue(installed: number, remoteCode: number | null, firstSeenAt: number | null, now: number): boolean {
  if (!(installed > 0) || remoteCode == null || !(remoteCode > installed)) return false;
  if (firstSeenAt == null || !Number.isFinite(firstSeenAt)) return false;
  return now - firstSeenAt >= STORE_DELAY_MS;
}

/**
 * Oct 14 client: remembers (localStorage) when this phone first saw a newer version
 * and returns that time (null = not newer / unknown).
 */
export function noteNewerVersion(installed: number, remoteCode: number | null, now: number = Date.now()): number | null {
  try {
    if (!(installed > 0) || remoteCode == null || !(remoteCode > installed)) {
      if (remoteCode != null) localStorage.removeItem(SEEN_KEY); // up to date: reset the clock
      return null;
    }
    let at = Number(localStorage.getItem(SEEN_KEY));
    if (!at || !Number.isFinite(at)) { at = now; localStorage.setItem(SEEN_KEY, String(now)); }
    return at;
  } catch { return null; }
}

/** Remembers (localStorage) when this phone first saw a newer version, then asks updateDue. */
export function storeUpdateDue(installed: number, remoteCode: number | null, now: number = Date.now()): boolean {
  const at = noteNewerVersion(installed, remoteCode, now);
  return updateDue(installed, remoteCode, at, now);
}

// ---------------------------------------------------------------------------
// Oct 14 client: the "New version available" POP-UP (phone app only).
//  - 'ask'   : same rules as the bar (live version.json newer for 3+ days on this
//              phone, or Android and the portal setting android_latest_version_code
//              is higher). "Later" hides it for 24 hours; the bar stays meanwhile.
//  - 'force' : the live version has been newer for 30+ days on this phone, or the
//              portal setting app_min_version_code is higher than this app.
//              No "Later" -- the driver must update.
// ---------------------------------------------------------------------------
export const FORCE_AFTER_MS = 30 * 86400e3;
export const LATER_MS = 24 * 3600e3;
const LATER_KEY = 'zlz_update_popup_later_until';

export const PLAY_MARKET_URL = 'market://details?id=org.zehlzeh.volunteer';
export const PLAY_HTTPS_URL = 'https://play.google.com/store/apps/details?id=org.zehlzeh.volunteer';
/** Oct 14 client: the iPhone app in the App Store (portal setting ios_app_store_url overrides it). */
export const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/zeh-lzeh-rescue/id6796505588';

export type UpdatePopupState = 'none' | 'ask' | 'force';

export type UpdatePopupInput = {
  installed: number;              // this app's versionCode (__APP_VERSION_CODE__)
  isAndroid: boolean;
  remoteCode: number | null;      // live /rescue/version.json versionCode (null = unknown)
  firstSeenAt: number | null;     // when this phone first saw remoteCode > installed
  latestAndroid: number | null;   // portal setting android_latest_version_code
  appMin: number | null;          // portal setting app_min_version_code
  laterUntil: number | null;      // "Later" pressed: hidden until this time
  now: number;
};

/** Pure decision for the pop-up. */
export function decideUpdatePopup(i: UpdatePopupInput): UpdatePopupState {
  if (!(i.installed > 0)) return 'none';
  if (i.appMin != null && i.appMin > 0 && i.installed < i.appMin) return 'force';
  const remoteNewer = i.remoteCode != null && i.remoteCode > i.installed;
  if (remoteNewer && i.firstSeenAt != null && Number.isFinite(i.firstSeenAt) && i.now - i.firstSeenAt >= FORCE_AFTER_MS) return 'force';
  const due = updateDue(i.installed, i.remoteCode, i.firstSeenAt, i.now)
    || (i.isAndroid && i.latestAndroid != null && i.installed < i.latestAndroid);
  if (!due) return 'none';
  if (i.laterUntil != null && Number.isFinite(i.laterUntil) && i.now < i.laterUntil) return 'none';
  return 'ask';
}

export function getLaterUntil(): number | null {
  try {
    const v = Number(localStorage.getItem(LATER_KEY));
    return v && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** "Later": hide the pop-up for 24 hours. Returns the time it may show again. */
export function snoozeUpdatePopup(now: number = Date.now()): number {
  const until = now + LATER_MS;
  try { localStorage.setItem(LATER_KEY, String(until)); } catch { /* fine */ }
  return until;
}

/**
 * Opens the store page. Android: the Play Store app (market://); if the phone is
 * still showing our app after 1.5 s (no Play Store app), the web page instead.
 * iPhone: the App Store link (portal setting ios_app_store_url, else IOS_APP_STORE_URL — Oct 14 client).
 */
export function openStoreListing(isIOS: boolean, iosUrl: string | null): boolean {
  try {
    if (isIOS) {
      window.open(iosUrl || IOS_APP_STORE_URL, '_blank');
      return true;
    }
    window.location.href = PLAY_MARKET_URL;
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') window.open(PLAY_HTTPS_URL, '_blank');
    }, 1500);
    return true;
  } catch { return false; }
}
