// The Daily rope (an experiment for the second playtest, 14 Nov 2026): the days the Daily was played in a row, with
// one missed day a week forgiven, and the time to the next Daily (midnight UTC).
// Run: node --test (Node 22.18 or newer, which reads the TypeScript sources directly).
import test from 'node:test';
import assert from 'node:assert/strict';

const skip = process.features.typescript ? false : 'needs a Node that reads TypeScript (22.18 or newer)';
const TODAY = '2026-11-14';
const day = n => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
/** The rope for the Dailies played `n` days ago (0 is today). */
const rope = async (...ago) => {
  const { ropeOf } = await import('../src/scripts/rope.ts');
  const played = new Set(ago.map(day));
  return ropeOf(d => played.has(d), TODAY);
};

test('the days in a row, up to today or, while today is still to play, up to yesterday', { skip }, async () => {
  assert.deepEqual(await rope(), { days: 0, knots: [] }, 'nothing played');
  assert.equal((await rope(0)).days, 1, 'only today');
  assert.equal((await rope(0, 1, 2)).days, 3, 'today and the two days before');
  assert.equal((await rope(1, 2)).days, 2, "today's still to play: the rope so far waits for it");
  assert.equal((await rope(0, 1, 2, 5, 6)).days, 3, 'two days missed in a row cut the rope');
  assert.deepEqual(await rope(2, 3), { days: 2, knots: [false, true, true] }, "yesterday missed, today's still to play: forgiven, the rope waits");
  assert.equal((await rope(3, 4)).days, 0, 'yesterday and the day before missed: no rope (today can start a new one)');
});

test('one missed day is forgiven, once a week', { skip }, async () => {
  assert.deepEqual(await rope(0, 1, 3, 4), { days: 4, knots: [true, true, false, true, true] }, 'a day missed between two played ones');
  assert.equal((await rope(0, 3, 4)).days, 1, 'but not two in a row');
  assert.equal((await rope(0, 2, 4)).days, 2, 'two gaps in five days: the second cuts it');
  const weeks = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16]; // gaps at 7 and 15, seven days played between
  assert.equal((await rope(...weeks)).days, 15, 'a gap a week stays forgiven');
  assert.equal((await rope(1, 3)).days, 2, "today still to play, yesterday played, the day before missed: forgiven");
});

test('the next Daily comes at midnight UTC', { skip }, async () => {
  const { nextDailyIn, dayBefore } = await import('../src/scripts/rope.ts');
  assert.equal(nextDailyIn(Date.parse('2026-11-14T23:30:00Z')), 30 * 60e3);
  assert.equal(nextDailyIn(Date.parse('2026-11-14T00:00:00Z')), 24 * 3600e3);
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
});
