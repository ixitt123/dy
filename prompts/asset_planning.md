# Asset Planning Task

Use the injected Skills as mandatory rules.

## Skills

{{skill_asset_planning}}

{{skill_material_classifier}}

{{skill_platform_strategy}}

{{skill_aesthetic_review}}

{{skill_render_readiness}}

## Material Strategy

{{material_strategy_prompt}}

## Platform Strategy

{{platform_strategy_prompt}}

## Input

- Title: {{title}}
- Target platform: {{platform}}
- Platform specification: {{platform_spec}}
- Storyboard:

{{storyboard_json}}

## Output

Return one JSON object:

```json
{
  "asset_package": [
    {
      "scene": 1,
      "purpose": "",
      "asset_type": "chart",
      "asset_subtype": "",
      "reason": "",
      "generation_method": "",
      "image_prompt": "",
      "negative_prompt": "",
      "motion_prompt": "",
      "platform_fit": {
        "douyin": 0,
        "video_account": 0,
        "xiaohongshu": 0,
        "bilibili": 0
      },
      "aesthetic_score": 0,
      "readiness_score": 0,
      "render_ready": false,
      "risks": []
    }
  ],
  "asset_review": {
    "score": 0,
    "material_suitability": 0,
    "shot_suitability": 0,
    "communication_efficiency": 0,
    "aesthetic_risk": 0,
    "ai_flavor_risk": 0,
    "problems": [],
    "fixes": []
  },
  "render_readiness": {
    "score": 0,
    "ready": false,
    "blockers": [],
    "warnings": [],
    "checks": []
  }
}
```

Create exactly one Asset Package row for every storyboard scene. Do not generate media.
