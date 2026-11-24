// A Gordian Knot's answers, checked (worker/board.ts): every question of the edition's challenge, each once, each
// answered with a name that counts as right. The browser sends, for each question, the name of the entity its matcher
// found (app.ts, answer()), so an exact name is the rule; the same name in other case or without accents is also taken.
// Kept apart from the Durable Object so the tests can run it (test/board.test.mjs).
import { norm } from '../scripts/lib/text.mjs';

export function allRight(answers: [string, string][], right: Record<string, string[]>, n: number): boolean {
  if (answers.length !== n) return false;
  const seen = new Set<string>();
  for (const [k, said] of answers) {
    const names = Object.hasOwn(right, k) ? right[k] : undefined;
    if (!Array.isArray(names) || seen.has(k)) return false;
    seen.add(k);
    if (!names.includes(said)) {
      const t = norm(said);
      if (!t || !names.some(r => norm(r) === t)) return false;
    }
  }
  return true;
}
