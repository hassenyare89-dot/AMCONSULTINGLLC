# Hero video — status and replacement specification

## Status of the original video

`src/assets/hero.mp4.asset.json` is a **pointer**, not a video. It references Lovable's asset CDN at the
relative path `/__l5e/assets-v1/b25cad92-adc0-4c4a-a071-541ad0d294b8/hero.mp4` (6.9 MB, uploaded
2026-06-30). The file itself is **not in the ZIP**.

* An attempt to fetch it from `https://amconsultingllc.net/__l5e/…` was blocked by this development
  environment's network policy, so **the original video was not recovered** and was not verified.
* The pointer is preserved. On the Lovable deployment (which serves `/__l5e/…`) the original video should
  keep working. If the request fails anywhere, the `<video>` `onError` handler switches the hero to the
  bundled poster image `src/assets/hero-truck.jpg`.
* To recover it authoritatively: open the project in Lovable → Assets, download `hero.mp4`, then upload it
  in **AMCMS → Website CMS → Media library** and select it in **Homepage hero → Background video**.

## How the hero chooses a background

`home.hero.mode` (CMS): `auto` (default) · `3d` · `video` · `image`. In `auto`: 3D on capable desktops,
otherwise video, otherwise image. Reduced-motion and Save-Data always get the static image. Video and 3D
never render at the same time.

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
