---
name: cs1
description: Create a short HyperFrames explainer video from a concise topic or concept. Use when the user asks to make a 10-second explanation video, principle explainer, technical concept video, HyperFrames demo, or asks to turn a previous HyperFrames workflow into a reusable production process.
---

# CS1 HyperFrames Explainer

## Purpose

Produce a compact HyperFrames explanation video, following the proven workflow used for the 10-second HyperFrames principle video: define a visual identity, author a deterministic HTML composition, run HyperFrames quality checks, render an MP4 locally, and commit only source files.

## Default Output

- Duration: 10 seconds unless the user specifies otherwise.
- Format: 1920x1080, 30fps, MP4.
- Style: technical explainer with a clear visual system, not a generic template.
- Structure: three beats:
  1. Source concept: what the system starts from.
  2. Synchronization or process: how the parts are coordinated.
  3. Output: what the viewer gets at the end.

## Workflow

1. Sync the project before editing:

```powershell
git pull --ff-only origin main
git status --short
```

2. Read the HyperFrames instructions before authoring:

- `hyperframes` skill for composition rules.
- `hyperframes-cli` skill for scaffold, check, preview, and render commands.
- `house-style.md`, `references/typography.md`, and `references/transitions.md` when the video has text and multiple scenes.

3. Create a dedicated project under `docs/`, using a descriptive folder name:

```powershell
npx hyperframes init docs/<project-name> --non-interactive
```

4. Add a `DESIGN.md` before writing the composition. Include:

- One-paragraph style prompt.
- 3-6 exact hex colors with roles.
- Typography choices.
- Motion rules.
- What not to do.

5. Replace the scaffolded `index.html` with a complete standalone HyperFrames composition:

- Use a top-level `#root` with `data-composition-id`, `data-duration`, `data-width`, and `data-height`.
- Use `.clip` on every timed scene.
- Give later scenes initial `opacity: 0`.
- Register `window.__timelines["main"]`.
- Use deterministic GSAP only. Do not use `Math.random()`, `Date.now()`, `repeat: -1`, async timeline construction, or media play calls.
- Use transitions between scenes. Avoid jump cuts.
- Let the final scene fade out if appropriate.

6. Keep the script concise enough for the video length. For 10 seconds, prefer three short scenes with one headline and one support idea per scene.

7. Run quality checks until clean:

```powershell
npm run check
```

The result should have:

- `0 errors, 0 warnings` from lint.
- No console errors.
- WCAG contrast pass.
- No layout issues from inspect.

8. Render the MP4 to a local ignored export path:

```powershell
New-Item -ItemType Directory -Force -Path "jianying-exports\hyperframes" | Out-Null
npm run render -- --output "..\..\jianying-exports\hyperframes\<project-name>.mp4" --quality standard
```

Do not commit MP4, frame grabs, or other large exports.

9. Verify the rendered video:

```powershell
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,width,height,r_frame_rate -of json "<output>.mp4"
```

Optionally extract and inspect a representative frame.

10. Commit and push source changes only:

```powershell
git status --short
git add -A
git commit -m "HyperFrames explainer video <yyyy-MM-dd HH:mm>"
git push origin main
```

## Content Pattern

For a technical concept, map the idea into this narrative:

- Scene 1: "What is the source of truth?"
- Scene 2: "What synchronizes the moving parts?"
- Scene 3: "How does it become an output?"

For non-technical concepts, keep the same shape but rename the beats:

- Input.
- Mechanism.
- Result.

## Safety And Repo Rules

- Respect `.gitignore`. Do not upload `jianying-exports/`, `downloads/`, `.data/`, `voices/`, databases, secrets, or generated large media.
- Do not change unrelated project files.
- If `git pull --ff-only` fails, resolve Git state before continuing.
- If render succeeds but checks fail, fix checks first and re-render.
- In the final answer, report modified files, commit id, push result, output path, render specs, and whether sync succeeded.
