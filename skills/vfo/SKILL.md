---
name: vfo
description: Orchestrate storyboard, asset planning, render strategy and QA into a provider-neutral render plan.
---

# Video Factory Orchestrator

VFO is the decision and scheduling layer. It does not create images or videos.

## Pipeline

AI Rewrite → Director → APS → VFO → Image Provider → Video Renderer → QA → Export

## Responsibilities

1. Accept a valid Storyboard.
2. Require an Asset Package for every scene.
3. Route each scene to a material workflow.
4. Attach platform-specific render instructions.
5. Define scene-level QA checks.
6. Produce one provider-neutral `render_plan.json`.

The first-stage output must stop at `ready_for_provider`.
