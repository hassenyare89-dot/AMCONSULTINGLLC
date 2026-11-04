# Hero video — status and replacement specification

## Current landing video (2026-11-04)

The owner supplied a new landing video (`Video2.mp4`: aerial view of dump trucks and loaders at a sand
quarry, 1200×630, 30 fps, 23 s). It is bundled in the repository, so it works on any host:

| File | What | Size |
|---|---|---|
| `public/media/hero.webm` | VP9, no audio (preferred by browsers that support it) | ~0.9 MB |
| `public/media/hero.mp4` | H.264 High, `yuv420p`, `+faststart`, no audio (universal fallback) | ~2.1 MB |
| `public/media/hero-poster.jpg` | First frame; shown instantly, for reduced motion / Save-Data, and if video fails | ~100 KB |

The audio track was removed (the hero always plays muted) and the clip re-encoded for fast loading
(original 6.9 MB). The old Lovable-CDN pointer `src/assets/hero.mp4.asset.json` was removed — it only
worked on Lovable hosting.

Notes:
* In the Docker deployment Caddy serves `/media/*` directly from `public/media` (byte-range requests,
  which Safari/iOS require for video, plus a 7-day cache). Replacing the files and running
  `docker compose up -d --build` updates the video.
* Source resolution is 1200×630, so it is upscaled on large screens (slightly soft on 1440p+ monitors).
  A 1920×1080 master of the same footage would look sharper — upload it in the CMS (below) if available.
* Overrides: **AMCMS → Website CMS → Homepage hero → Background video / Poster** take precedence over the
  bundled files.

## How the hero chooses a background

`home.hero.mode` (CMS): `video` (default) · `auto` · `3d` · `image`. `video` plays the landing video on
every device. `auto` uses the 3D truck scene on capable desktops and video elsewhere. Reduced-motion and
Save-Data always get the static poster. Video and 3D never render at the same time.

Presentation (Nov 2026): the footage is shown in its true colours (no navy tint, slight saturation
boost). Text sits on a light, unblurred panel (black 35 %, no blur) so the footage stays visible through
it; every glyph carries a tight dark halo (text-outline technique). Without the halo, white text over
the brightest frames measures ≥ 3.0:1 (meets AA for the large headline); the halo provides the
contrast for body text. Raise the panel tint to ~48 % if strict 4.5:1 without halos is required. The pause control is visually hidden and appears only
when focused with the keyboard (WCAG 2.2.2 requires a way to pause moving content); reduced-motion
users never get the video.

## Replacement video specification

| Property | Requirement |
|---|---|
| Content | Heavy-duty dump truck(s) working a construction/hauling site; no people's faces, plates or third-party logos without releases; no claims or text burned in |
| Duration | 12–20 s, seamless loop (match first/last frame) |
| Resolution | 1920×1080 master; also export 1280×720 |
| Codec | H.264 High, `yuv420p`, MP4 with `+faststart`; optional VP9/AV1 WebM |
| Bitrate | ≤ 4 Mbps (1080p) / ≤ 2 Mbps (720p); target file ≤ 8 MB |
| Audio | None (strip the track) |
| Frame rate | 24–30 fps |
| Composition | Keep the left ~45 % visually calm — headline text sits there over a navy gradient |
| Poster | First frame as JPEG/WebP 1920×1080, ≤ 250 KB → upload as **Poster / fallback image** |
| Licensing | Owned footage or a licence permitting website use; keep the licence in Documents (category *Business policy*) |

Example encode:

```bash
ffmpeg -i master.mov -an -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 \
  -maxrate 4M -bufsize 8M -vf "scale=1920:-2" -movflags +faststart hero-1080.mp4
ffmpeg -i hero-1080.mp4 -vframes 1 -q:v 3 hero-poster.jpg
```

## Optional 3D model

The built-in dump truck is procedural (no licensing). To use a photoreal model, upload a **GLB** (≤ 30 MB,
ideally ≤ 5 MB with Draco/meshopt compression, Y-up, real-world scale, ≤ 100k triangles) to the Media
library and select it in **Homepage hero → Optional 3D truck model**. The scene auto-scales and centres it
and falls back to the procedural truck if it fails to load.
