# Globoknot audio: the slots

Every sound in the game has a named slot. Put a file named after the slot in `public/audio/` (for example
`public/audio/correct.mp3`) and build the site again: the build lists the files it finds, and the game plays each one
in its slot. A slot without a file keeps today's small synthesised placeholder, or stays silent where there is none.
Nothing is fetched for an empty slot.

The code is `src/scripts/sound.ts`; the moments are called from `src/scripts/app.ts`.

## Effects

| Slot | When it plays | Length | Without a file |
|---|---|---|---|
| `correct` | A right answer, first try (a tight knot) | 0.2 to 0.4 s | synth tick |
| `loose` | A right answer after a wrong try (a loose knot) | 0.2 to 0.4 s | `correct`, 3 semitones lower |
| `wrong` | A wrong pick, or a skip | 0.3 to 0.5 s | synth thud |
| `retry` | A wrong typed answer; the question stays open and the box clears | under 0.2 s | synth buzz |
| `tick` | Each of the last five seconds of a question (5, 4, 3, 2, 1) | under 0.1 s | synth tick |
| `timeout` | The time ran out | 0.4 to 0.7 s | synth thud |
| `heartbeat` | The Gordian Knot only: one beat every 1.3 s while a question is open (the crimson pulse at the edges) | under 0.5 s (lub-dub) | silent |
| `round-end` | The results open | 0.5 to 1.2 s | synth arpeggio |
| `knot` | On the results, each knot as the rope reaches it: up to 80 ms apart (rounds over 60 questions stay quiet) | under 0.12 s | silent |
| `rank` | The score and rank, about 0.25 s after the rope is drawn | 0.4 to 1 s | silent |
| `closed` | Instead of `rank` when every knot was tight: the rope closes into a ring and glows | 0.8 to 1.5 s | `rank` |

Pitch: the game changes the pitch of three slots, so make them in a key where that still sounds good.

- `correct` and `loose` go up a semitone for each answer in a row, up to 7 semitones (the 8th right answer in a row
  and on). A streak climbs like a scale.
- `tick` goes up a semitone each second: 0 at five seconds left, 4 at one second left.
- `knot` goes up half a semitone per knot round the ring, up to 6 semitones.

The pitch is changed by playing the file faster, so a higher note is also a little shorter.

## Music

| Slot | When it plays | Notes |
|---|---|---|
| `music-home` | The home screen and the results | Loops. Picks up where it left off. |
| `music-quiz` | During a round | Loops. Starts from the top each round. |

- Make each a seamless loop (the end runs straight into the start) at one steady tempo. 1 to 3 minutes is plenty.
- Browsers only allow sound after the first tap or key press, so the music starts then.
- Switching screens fades one track out and the other in over about half a second. The music pauses while the tab is
  hidden.
- The Music slider shows in Settings once there is at least one music file in the build.

## Formats and loudness

- **mp3** (128 to 192 kbps) plays in every browser. An `.ogg` works too, but when a slot has both, the mp3 is used:
  some browsers can't play ogg. `.m4a` and `.wav` also work (wav is big: fine for trying things out).
- Mono is fine for the effects.
- Leave some headroom: effects peaking around -3 dBFS, music around -18 LUFS, so the effects sit on top of it.
- Short effects should start right away: trim the silence before the sound.

## The volumes

Settings has three sliders: **Volume** (everything), **Effects** and **Music**. They start at 100, 100 and 70, follow
the square of the slider position (half way is a quarter of the power, which sounds even), and are kept in the browser
(`localStorage`, key `gk-audio`). Letting go of Volume or Effects plays a sample. Volume 0 turns all sound off.
