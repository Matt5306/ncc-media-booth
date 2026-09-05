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
