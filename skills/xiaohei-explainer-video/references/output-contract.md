# Output Contract

Use this file when checking whether a Xiaohei explainer package is complete.

## Required Files

```text
docs/<slug>-xiaohei-explainer/
  AGENTS.md
  DESIGN.md
  director-script.md
  storyboard.json
  index.html
  package.json
```

Optional local-only files:

```text
video-products/<slug>-xiaohei-explainer.mp4
video-products/<slug>-xiaohei-explainer-contact.jpg
```

## storyboard.json Required Shape

```json
{
  "title": "",
  "source_summary": "",
  "format": {
    "width": 1920,
    "height": 1080,
    "duration_seconds": 45,
    "language": "zh-CN"
  },
  "story_arc": {
    "hook": "",
    "pain": "",
    "conflict": "",
    "proof": "",
    "solution": "",
    "cta": ""
  },
  "visual_system": {
    "style": "",
    "character": "Xiaohei 2.0",
    "palette": [],
    "forbidden": []
  },
  "shots": [
    {
      "scene": 1,
      "start": 0,
      "duration": 5,
      "purpose": "",
      "emotion": "",
      "voice_text": "",
      "subtitle": "",
      "camera": "",
      "composition": "",
      "xiaohei_action": {
        "identity_anchor": "",
        "action": "",
        "contact_point": "",
        "emotion": "",
        "stability_constraints": ""
      },
      "image_prompt": "",
      "motion_prompt": "",
      "vfx_contract": {
        "source": "",
        "material": "",
        "motion_path": "",
        "light_interaction": "",
        "object_interaction": "",
        "dissipation": "",
        "endpoint": "",
        "stability_constraints": "",
        "prompt_ready_phrase": ""
      },
      "transition": "",
      "notes": ""
    }
  ],
  "qa": {
    "score": 0,
    "problems": [],
    "fixes": []
  }
}
```

## DESIGN.md Checklist

- Names Xiaohei 2.0 as an original 3D animated collectible protagonist.
- Defines white canvas, black structure lines, red/orange/blue annotation roles.
- States that final prompts must not copy existing IP or named studio style.
- Includes motion rules and HyperFrames transition choices.
- Includes "What NOT to Do".

## HyperFrames Checklist

- `data-composition-id="main"` exists.
- `data-width="1920"` and `data-height="1080"` exist.
- Root duration matches storyboard duration.
- `window.__timelines["main"]` is registered synchronously.
- Every scene has entrance animation.
- Multi-scene transitions exist.
- No `repeat: -1`.
- No `Math.random()` or `Date.now()`.
- `npm run check` passes hard errors.
