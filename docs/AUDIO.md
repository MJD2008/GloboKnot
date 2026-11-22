# Globoknot audio: the slots

Every sound in the game has a named slot. Put a file named after the slot in `public/audio/` (for example
`public/audio/correct.mp3`) and build the site again: the build lists the files it finds, and the game plays each one
in its slot. A slot without a file keeps a small synthesised placeholder, or stays silent where there is none. Nothing
is fetched for an empty slot.

The code is `src/scripts/sound.ts`; the moments are called from `src/scripts/app.ts` (and `press.ts`, `sheet.ts`).

James's own audio went in on 22 Nov 2026, from `Audio_Globoknot.zip`. `scripts/audio/make_audio.py` turned his files
into the slots below: it trims the silence at both ends, fades the effects out at their end, sets the effects to the
peaks in the table, and brings every music track to the same loudness (-20 LUFS) as a 128 kbps mp3. To change a sound,
run it again on new files, or drop a finished file straight into `public/audio`.

## How it should feel (James, 22 Nov 2026)

"So it feels responsive and never feels like an audio asset suddenly gets played", and nothing "too aggressive or
impeding". So:

- **Music never starts or stops; it fades.** Every change of track is a crossfade, and a track that comes to its end
  starts again on a second player and overlaps itself for six seconds, so it never stops and never jumps.
- **Space blends into the jazz.** The home screen plays space. Zooming into the globe, or starting a round, brings the
  music of the time of day in over about three seconds: it comes up muffled and opens out as space fades, as if coming
  down through the atmosphere. Going back to the home screen (or the globe back into its rope) does the reverse.
- **Effects start on the tap.** They are fetched and decoded on the first tap, and any silence before the sound is
  skipped. The click under the finger (`select`) plays the moment a button goes down.
- **The music dips under an effect.** A right answer dips it by about a quarter for a quarter of a second, the start of
  a round or a low score by about half for a second, then it comes back up gently. The click and the ticks leave it
  alone.
- **Even loudness.** The music tracks were up to 12 dB apart; now they are the same, well under the effects (and Music
  starts at 70 in Settings).

## Music

| Slot | James's file | When it plays |
|---|---|---|
| `music-home` | MainMenuSpace | The home screen, with the globe in its rope. Picks up where it left off. |
| `music-morning` | Morning | Zoomed into the globe, a round, Practice and the results, 6:00 to 12:00 |
| `music-afternoon` | Afternoon | The same, 12:00 to 18:00 |
| `music-evening` | Evening | The same, 18:00 to 22:00 |
| `music-night` | Night | The same, 22:00 to 6:00 |
| `music-gordian` | AtlasAllMode | The Gordian Knot (Atlas, All) and its results |
| `music-quiz` | (none) | Instead of the time of day, if those four were missing |

- The time of day is the player's own clock, so it is morning music in the morning wherever they are. A track is
  picked when the scene changes (a round starting, the globe zoomed); a round in progress keeps its track.
- The results keep the round's music, so "Play again" carries straight on. Each track picks up where it was left.
- Browsers only allow sound after the first tap or key press, so the music starts then (with a fade in).
- The music pauses while the tab is hidden and fades back in when it shows again.
- The Music slider shows in Settings once there is at least one music file in the build.
- A track needs no special loop: the game overlaps its last six seconds with its start. A soft ending (a fade out, or
  a held note) works best.

## Effects

| Slot | James's file | When it plays | Without a file |
|---|---|---|---|
| `select` | Select(anything) | Any button, the moment it goes down (a 7.5 ms click) | silent |
| `correct` | correctAnswer | A right answer, first try (a tight knot) | synth tick |
| `loose` | (none) | A right answer after a wrong try (a loose knot) | `correct`, 3 semitones lower |
| `wrong` | incorrectAnswer | A wrong pick, or a skip | synth thud |
| `retry` | (none) | A wrong typed answer; the question stays open and the box clears | `wrong`, softer and 3 semitones higher |
| `timeout` | (none) | The time ran out | `wrong`, 2 semitones lower |
| `start` | gameStarted | A round, or Practice, begins | silent |
| `open` | openIndex&openExtraDetails | A panel opens: the configuration, Practice, About, Settings, a country's sheet, an answer on the map | silent |
| `low` | lowScore | The results, when under half the answers were right | `round-end` |
| `round-end` | (none) | The results, half right or more | `correct` climbing a chord (two notes, three, or four from 80%) |
| `tick` | (none) | Each of the last five seconds of a question (5, 4, 3, 2, 1) | synth tick |
| `heartbeat` | (none) | The Gordian Knot only: one beat every 1.3 s while a question is open (the crimson pulse at the edges) | silent |
| `knot` | (none) | On the results, each knot as the rope reaches it: up to 80 ms apart (rounds over 60 questions stay quiet) | silent |
| `rank` | (none) | The score and rank, about 0.25 s after the rope is drawn | silent |
| `closed` | (none) | Instead of `rank` when every knot was tight: the rope closes into a ring and glows | `rank` |

How James's effects were fitted (`scripts/audio/make_audio.py`):

| Slot | Kept | Peak |
|---|---|---|
| `correct` | the first 0.29 s (the rest was silence) | -5 dBFS |
| `wrong` | the first 0.5 s | -5 dBFS |
| `start` | the first 1.3 s, fading out | -6 dBFS |
| `low` | the first 1.6 s | -9 dBFS (it was the loudest) |
| `open` | the first 1.25 s of 3.4 s, fading out, so it never trails over the next tap | -10 dBFS |
| `select` | all of it | -12 dBFS (heard on every press) |

Pitch: the game changes the pitch of some slots, so make them in a key where that still sounds good.

- `correct` and `loose` go up a semitone for each answer in a row, up to 7 semitones (the 8th right answer in a row
  and on). A streak climbs like a scale.
- `tick` goes up a semitone each second: 0 at five seconds left, 4 at one second left.
- `knot` goes up half a semitone per knot round the ring, up to 6 semitones.

The pitch is changed by playing the file faster, so a higher note is also a little shorter.

## Formats and loudness

- **mp3** (128 to 192 kbps) plays in every browser. An `.ogg` works too, but when a slot has both, the mp3 is used:
  some browsers can't play ogg. `.m4a` and `.wav` also work (`select` is a wav: 520 bytes, and no mp3 padding).
- Mono is fine for the effects.
- Leave some headroom: effects peaking around -5 dBFS, music around -20 LUFS, so the effects sit on top of it.
- Short effects should start right away (the game skips up to 80 ms of silence before the sound anyway).

## The volumes

Settings has three sliders: **Volume** (everything), **Effects** and **Music**. They start at 100, 100 and 70, follow
the square of the slider position (half way is a quarter of the power, which sounds even), and are kept in the browser
(`localStorage`, key `gk-audio`). Letting go of Volume or Effects plays a sample. Volume 0 turns all sound off.

## For the tests

The page writes the track it is playing on `<body data-music="music-home">` and the player it is on in `data-voice`.
