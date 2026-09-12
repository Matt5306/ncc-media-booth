# Sanctuary photos

Drop photos in this folder and the games pick them up automatically on the next
page load. If a file is missing, the game falls back to its drawn scene — nothing
breaks, and you never have to touch any code.

## Filenames the games look for

| File | Used by | What to shoot |
|---|---|---|
| `sanctuary-wide.jpg` | **Camera game** — the backdrop when there is no webcam | The whole room from the back. Stage, screens, some seating. No people needed. |
| `sanctuary-stage.jpg` | **Lower Thirds** — the program monitor behind the name bar | The stage and pulpit, framed like a camera shot. A person standing there is good, since the name bar sits under them. |

Exact names, lower case, `.jpg`.

Already in this folder and **meant to stay**: `icon.png` — the 512px home-screen icon
(the church dove on a dark background) that `manifest.json` points at. It is what shows
up when someone does "Add to Home Screen" on their phone. Do not delete it.

## What makes a good one

- **Landscape**, roughly 16:9. Portrait phone photos get cropped badly.
- **1280px wide or better.** Bigger is fine, the browser scales it down.
- **Lit like a normal service.** A dark empty room reads as murky on a TV.
- **Leave the lower third of the frame uncluttered** for `sanctuary-stage.jpg` —
  that is where the name bar lands.
- Keep each file under about 2 MB so the booth laptop loads it instantly.

## Where to get them

Best to worst:

1. **Take them in the sanctuary.** A phone photo from the back of the room beats
   anything pulled off a compressed livestream.
2. **Export a frame from the church's own recording files**, if the media team
   keeps them.
3. A frame grabbed from the YouTube stream. Workable, but it is already
   compressed twice and usually catches someone mid-blink.

The channel's YouTube *thumbnails* are not useful for this — they are almost all
the dove logo, plus some vertical talking-head clips. Checked on 2026-08-31.

## Adding more later

The lookup lives in `docs/js/arcade.js` as `Arcade.backdrop(url, callback)`.
Each game calls it once on load with the filename it wants.

- `loop-full-30s.mp4` — the full 30 s Canva export (2026-09-07, checks fixed). `loop.mp4` is the first 14 s of it with a 1 s fade, **with its audio kept and lowered 7 dB** (since 2026-09-12), for attract.html. Re-cut with:
  `ffmpeg -i loop-full-30s.mp4 -t 14 -vf "fade=t=out:st=13:d=1" -af "volume=-7dB,afade=t=out:st=12.8:d=1.2" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart loop.mp4`

## TV sound (`audio/`)

All four are Mixkit tracks (Mixkit License: free to use, no attribution needed). attract.html plays them only when opened with `?sound=1`, which `START-TV.bat` does; set `SOUND=0` in the bat to run silent. Levels live in `CONFIG.sound` at the top of attract.html.

| File | What | Source |
|---|---|---|
| `audio/bed.mp3` | music under the slides, loops, -18 LUFS | Mixkit "Pop Track 03" |
| `audio/cue.mp3` | movie-trailer cue from the finger reveal to the crew slide, -15 LUFS | Mixkit "I Won't Surrender" |
| `audio/pop.mp3` | one per check in the video | Mixkit "Long pop" |
| `audio/hit.mp3` | the impact as the finger photo fades in | Mixkit "Big cinematic impact" |

To swap a track: drop the new MP3 over the old name. The team's alternates are in `docs/preview/audio/`.
