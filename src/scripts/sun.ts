// Where the sun is right now, for day and night on the home globe (preview 16). Pure and import-free, so Node's
// tests load it as it is.

export type Vec = [number, number, number];
const RAD = Math.PI / 180;

/** The point on Earth with the sun straight overhead at a moment (ms since 1970, UTC): [longitude, latitude] in
 *  degrees. The U.S. Naval Observatory's approximate solar coordinates: within about a minute of time and a hundredth
 *  of a degree of latitude for two centuries either side of 2000, plenty for a globe. */
export function subsolar(ms: number): [number, number] {
  const d = ms / 864e5 - 10957.5; // days since 2000-01-01 12:00 UTC (J2000.0)
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity of the ecliptic
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15; // right ascension, hours
  const lat = Math.asin(Math.sin(e) * Math.sin(L)) / RAD; // declination
  const eqt = ((((q / 15 - ra) % 24) + 36) % 24) - 12; // equation of time, hours: sundial minus clock
  const ut = (((ms / 36e5) % 24) + 24) % 24; // hours since midnight UTC
  // Noon by the sundial is where the sun is overhead: local apparent time = ut + eqt + lon / 15 = 12.
  const lon = (((((12 - ut - eqt) * 15) % 360) + 540) % 360) - 180;
  return [lon, lat];
}

/** A place [longitude, latitude] in degrees as a unit vector: x towards 0° 0°, y towards 90° E, z towards the north
 *  pole. */
export function unit([lon, lat]: [number, number]): Vec {
  const l = lon * RAD, p = lat * RAD, c = Math.cos(p);
  return [Math.cos(l) * c, Math.sin(l) * c, Math.sin(p)];
}

/** How high the sun stands over a place, as the sine of its altitude: 1 overhead, 0 on the horizon (the line between
 *  day and night), below 0 at night (-0.1 is about 6° below: the end of civil twilight). */
export function sunHeight(place: [number, number], ms: number): number {
  const a = unit(place), b = unit(subsolar(ms));
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
