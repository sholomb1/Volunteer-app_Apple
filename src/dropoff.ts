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
 * Universal maps URL. Query is the street address ONLY — including the display
 * name ("Zeh L'Zeh Drop-off Center") caused Google Maps to occasionally
 * disambiguate to a different pin. Use ?query= (search intent) so both the
 * native maps app and the mobile web fall back cleanly.
 */
export const DROPOFF_MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(DROPOFF.address);
