---
name: material-classifier
description: Classify storyboard scene intent and choose the most suitable material category.
---

# Material Classifier

Choose from:

`ai_image`, `stock_video`, `chart`, `infographic`, `text_motion`, `screenshot`, `ui_demo`, `real_photo`, `document`, `mixed`.

## Selection Rules

- Data, comparison, percentage or trend: prefer `chart` or `infographic`.
- Steps, formulas, definitions or strong statements: prefer `text_motion` or `infographic`.
- Software operations or product walkthroughs: prefer `screenshot` or `ui_demo`.
- Certificates, policies, reports or worksheets: prefer `document`.
- Campus enrollment: prefer `real_photo` with `campus_photo` or `student_scene`.
- Parent anxiety: prefer `real_photo` with `family_scene`, `report_card` or `study_room`.
- Atmosphere, action or environmental continuity: prefer `stock_video`.
- Unavailable but visually specific concepts: use `ai_image`.
- Use `mixed` only when one material cannot communicate the scene.

Do not choose `ai_image` by default. Evidence and clarity take priority over visual novelty.
