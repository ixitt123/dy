# Workflow Router Task

For each Asset Package row, define a provider-neutral preparation workflow.

{{skill_workflow_router}}

{{skill_asset_selector}}

The workflow must identify prerequisites, preparation steps, fallback material and blocking conditions. Do not call a Provider.

Return one JSON object:

```json
{
  "scenes": [
    {
      "scene": 1,
      "asset_type": "chart",
      "generation_strategy": {
        "method": "",
        "prerequisites": [],
        "steps": [],
        "fallback": "",
        "blockers": []
      },
      "render_strategy": {
        "duration": 3,
        "composition": "",
        "crop": "",
        "motion": "",
        "subtitle": {
          "position": "bottom",
          "size": "large",
          "density": "high",
          "highlight_words": []
        },
        "transition": "straight_cut",
        "transition_duration": 0.15,
        "audio": "",
        "fallback": ""
      },
      "qa": {
        "score": 90,
        "ready": true,
        "checks": [],
        "blockers": [],
        "warnings": []
      }
    }
  ],
  "qa_review": {
    "score": 90,
    "communication_efficiency": 90,
    "aesthetics": 90,
    "information_density": 90,
    "platform_fit": 90,
    "ai_flavor_risk": 15,
    "blockers": [],
    "problems": [],
    "fixes": []
  }
}
```
