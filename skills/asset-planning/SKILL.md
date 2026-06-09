---
name: asset-planning
description: Plan the correct material for every storyboard scene before image generation or video rendering.
---

# Asset Planning

## Goal

Convert a completed Storyboard into an executable Asset Package. Do not create media.

## Workflow

1. Read each scene's purpose, voice text, subtitle, emotion, composition and platform.
2. Classify the information function before choosing an asset.
3. Select one primary asset type and an optional subtype.
4. Explain why the asset serves the scene better than alternatives.
5. Prepare prompts or acquisition instructions only.
6. Score platform fit, aesthetic risk and render readiness.

## Required Output Per Scene

- `scene`
- `purpose`
- `asset_type`
- `asset_subtype`
- `reason`
- `generation_method`
- `image_prompt`
- `negative_prompt`
- `motion_prompt`
- `platform_fit`
- `aesthetic_score`
- `readiness_score`
- `render_ready`
- `risks`

Never generate images, videos or downloadable assets.
