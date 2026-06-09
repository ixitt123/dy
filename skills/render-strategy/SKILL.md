---
name: render-strategy
description: Define provider-neutral composition, timing, subtitles, motion and transitions for each target platform.
---

# Render Strategy

For every scene define:

- canvas ratio and safe area
- duration and trim range
- asset placement and crop behavior
- camera or layer motion
- subtitle position, size and highlighted words
- transition and transition duration
- BGM and SFX relationship
- fallback when the preferred asset is unavailable

Keep instructions provider-neutral. Do not emit Remotion, VideoFlow or editing-software code in phase one.
