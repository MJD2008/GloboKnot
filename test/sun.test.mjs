// Day and night on the home globe: where the sun is overhead, checked against the almanac.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subsolar, sunHeight } from '../src/scripts/sun.ts';

const at = s => Date.parse(s);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(3)} not within ${tol} of ${b}`);

test('the sun overhead: declination through the year', () => {
  // Solstices and equinoxes of 2026 (UTC): the latitude of the sun is the declination.
  near(subsolar(at('2026-03-20T14:46:00Z'))[1], 0, 0.05, 'March equinox');
  near(subsolar(at('2026-06-21T08:24:00Z'))[1], 23.436, 0.02, 'June solstice');
  near(subsolar(at('2026-09-23T00:05:00Z'))[1], 0, 0.05, 'September equinox');
  near(subsolar(at('2026-12-21T20:50:00Z'))[1], -23.436, 0.02, 'December solstice');
  // 16 Nov 2026 at noon UTC: declination about -18.7°.
  near(subsolar(at('2026-11-16T12:00:00Z'))[1], -18.7, 0.2, '16 Nov');
});

test('the sun overhead: longitude follows the clock and the equation of time', () => {
  // Mid-November the sundial runs about 15 minutes ahead of the clock, so the sun crosses Greenwich at about 11:45 UTC
  // and stands about 3.8° west of it at noon.
  near(subsolar(at('2026-11-16T12:00:00Z'))[0], -3.8, 0.3, 'noon, 16 Nov');
  near(subsolar(at('2026-11-16T11:44:50Z'))[0], 0, 0.3, 'sundial noon at Greenwich');
  // Mid-February it runs about 14 minutes behind: the sun is over Greenwich at about 12:14 UTC.
  near(subsolar(at('2026-02-11T12:14:15Z'))[0], 0, 0.3, 'sundial noon, 11 Feb');
  // Six hours later the sun is a quarter of the way round, to the west; the longitude stays within ±180.
  const [l6] = subsolar(at('2026-11-16T18:00:00Z'));
  near(l6, -93.8, 0.3, '18:00 UTC');
  const [l0] = subsolar(at('2026-11-17T00:00:00Z'));
  near(Math.abs(l0), 176.2, 0.3, 'midnight UTC');
  assert.ok(l0 >= -180 && l0 < 180);
});

test('day and night at real places', () => {
  const brussels = [4.35, 50.85], sydney = [151.21, -33.87], quito = [-78.47, -0.18];
  // Brussels in November: dark at 19:00 local time, day at 13:00; Sydney at 13:00 (AEDT).
  assert.ok(sunHeight(brussels, at('2026-11-16T18:00:00Z')) < -0.2, 'Brussels at 19:00 is dark');
  assert.ok(sunHeight(brussels, at('2026-11-16T12:00:00Z')) > 0.3, 'Brussels at 13:00 is day');
  assert.ok(sunHeight(sydney, at('2026-11-16T02:00:00Z')) > 0.5, 'Sydney at 13:00 is day');
  // On the equator the sun rises six hours before its noon: in Quito (78.5° W, sundial 15 minutes ahead) the centre of
  // the sun is on the horizon at about 05:59 local time (10:59 UTC) on 16 Nov.
  near(sunHeight(quito, at('2026-11-16T10:59:00Z')), 0, 0.01, 'sunrise in Quito');
});
