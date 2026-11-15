// The Daily rope (experiment, 14 Nov 2026, from the plan "Globoknot: a reason to come back"): the days the Daily was
// played in a row, shown on its button, and the time to the next Daily once today's is done. Days are UTC dates, as
// the Daily's are: everyone gets the same eight questions on the same day, and a new Daily comes at midnight UTC.

/** The day before. */
export const dayBefore = (day: string) => new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);

/**
 * The days played in a row up to `day`, or up to the day before while that day's Daily is still to play. A missed day
 * between two played ones is forgiven (an open knot), so one lost day doesn't cut a long rope, but only once a week: a
 * second needs seven days played since the first. Two missed days in a row cut it. `knots`: newest first, true for a
 * day played, false for one forgiven.
 */
export function ropeOf(played: (day: string) => boolean, day: string): { days: number; knots: boolean[] } {
  const knots: boolean[] = [];
  let d = played(day) ? day : dayBefore(day), forgiven = -99;
  for (let i = 0; i < 400; i++, d = dayBefore(d)) {
    if (played(d)) knots.push(true);
    else if (knots.length - forgiven > 7 && played(dayBefore(d))) { forgiven = knots.length; knots.push(false); }
    else break;
  }
  return { days: knots.filter(Boolean).length, knots };
}
/** Milliseconds until the next Daily (midnight UTC). */
export const nextDailyIn = (now = Date.now()) => Date.parse(new Date(now).toISOString().slice(0, 10)) + 864e5 - now;
