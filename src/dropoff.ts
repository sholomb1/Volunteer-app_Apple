/**
 * Single source of truth for the Zeh L'Zeh drop-off center.
 * Referenced from PickupDetail, TripCapture, and (mirrored server-side) the
 * pickup broadcast SMS template. Update here and in
 * volunteer-portal/apps/api/src/routes/sms.ts if the address ever changes.
 */
export const DROPOFF = {
  name:    "Zeh L'Zeh Drop-off Center",
  address: '3 Regina Road, Airmont, NY',
  // Full display string used inline in older screens.
  fullLine: "Zeh L'Zeh Drop-off Center — 3 Regina Road, Airmont, NY",
} as const;

/**
 * Universal maps URL that opens the native maps app on iOS/Android when
 * possible and falls back to Google Maps on the web. Using the standard
 * https://www.google.com/maps/dir/?api=1 form so both platforms accept it.
 */
export const DROPOFF_MAPS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=' +
  encodeURIComponent(`${DROPOFF.name}, ${DROPOFF.address}`);
