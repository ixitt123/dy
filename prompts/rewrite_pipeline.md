# Rewrite Pipeline Prompt

You are running a Skill-driven rewrite workflow for education enrollment copy.

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

## Workflow

Step 1: Extract the original structure:
- hook
- pain
- emotion
- reverse
- solution
- cta

Step 2: Rebuild the structure according to the rewrite direction.

Step 3: Inject boss style and selected style profile.

Step 4: Inject reference examples. Learn rhythm, sentence length, turn-taking, and structure. Do not copy wording.

Step 5: Remove AI-flavored phrasing, official tone, fake grand words, and mechanical parallelism.

Step 6: Output exactly the selected versions in Output boxes.
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
    "hook": "",
    "pain": "",
    "emotion": "",
    "reverse": "",
    "solution": "",
    "cta": ""
  },
  "versions": {}
}
