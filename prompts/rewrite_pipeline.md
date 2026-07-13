# Rewrite Pipeline Prompt

You are running a Skill-driven rewrite workflow for short-video copy.

## Non-negotiable Fidelity Rules

The rewritten copy must stay about the same subject as the Original Text.
- Preserve the original topic, people, event, product, platform, place, factual claims, sequence, and intent.
- Do not invent schools, parents, teachers, enrollment, courses, sales scenes, numbers, testimonials, or industry-specific details unless they already exist in the Original Text.
- Rewrite direction, style profile, and reference examples may change rhythm, tone, structure, hook strength, and wording only. They must not replace the original content with a different story.
- If the selected direction is marketing or conversion, convert only around the original topic. Do not force education enrollment language onto unrelated content.
- If the Original Text is about AI tools, software, video generation, content workflow, or another non-education topic, keep that topic.

## Loaded Skills

{{skill_rewrite_douyin_education}}

{{skill_boss_style}}

## Original Text

{{original_text}}

## AI Analysis JSON

{{analysis_json}}

## Style Profile

{{style_profile}}

## Reference Examples

{{reference_examples}}

## User Parameters

- Rewrite direction: {{rewrite_direction}}
- Tone level: {{tone_level}} / 10
- Conflict level: {{conflict_level}} / 10
- Emotion level: {{emotion_level}} / 10
- Sales level: {{sales_level}} / 10
- Humanize level: {{humanize_level}}
- Output boxes: {{version_specs}}

## Revision Instruction

{{revision_instruction}}

When a revision instruction is provided, treat Original Text as the current draft. Follow the revision instruction first while preserving the selected direction and hard word-count requirement.

## Workflow

Step 1: Extract the original factual core:
- topic
- target audience
- key event / claim
- must-preserve details
- details that must not be invented

Step 2: Extract the original structure:
- hook
- pain
- emotion
- reverse
- solution
- cta

Step 3: Rebuild the structure according to the rewrite direction without changing the factual core.

Step 4: Inject selected style profile.

Step 5: Inject reference examples. Learn rhythm, sentence length, turn-taking, and structure. Do not copy wording or transplant their topic.

Step 6: Remove AI-flavored phrasing, official tone, fake grand words, and mechanical parallelism.

Step 7: Run a fidelity check before output.
- Every version must be traceable to the Original Text.
- If a sentence cannot be supported by the Original Text, delete or rewrite it.
- Do not output generic education, enrollment, parent, school, or teacher copy unless the Original Text is actually about that.

Step 8: Output exactly the selected versions in Output boxes.
- Use each selected version key exactly.
- Follow each selected version's direction and wordCount.
- Treat wordCount as a hard delivery requirement, not a suggestion.
- Count Chinese characters after removing spaces and line breaks.
- For "N字左右", keep the final text within N +/- 5%, with a minimum tolerance of 8 characters.
- For a numeric range, keep the final text inside that range.
- Do not create unselected versions.

## Output Format

Return JSON only. No Markdown, no explanation.

{
  "structure": {
    "topic": "",
    "audience": "",
    "must_preserve": [],
    "forbidden_inventions": [],
    "hook": "",
    "pain": "",
    "emotion": "",
    "reverse": "",
    "solution": "",
    "cta": ""
  },
  "versions": {}
}
