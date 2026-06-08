# AGENTS.md

## Project Goal

This project is a local Douyin video batch processing and education enrollment copywriting tool. It supports local WebUI workflows for parsing Douyin share links, downloading videos, extracting transcripts, analyzing content, managing task queues, exporting task data, and producing rewritten enrollment copy.

## Technical Boundaries

- Do not break existing download, transcript extraction, AI analysis, task queue, SQLite storage, CSV/XLSX export, or downloaded-file management.
- Preserve backward compatibility with existing `settings.json` and `.data/tasks.sqlite`.
- Never clear, recreate, or reset the existing SQLite database during migrations.
- API keys must remain local in `settings.json`; do not write keys to logs, exports, generated rewrite files, or desktop source packages.
- Generated files should stay inside project-managed folders such as `downloads/` and `rewrites/`.

## Rewrite Module Principles

- Do not perform direct one-shot "original text to rewrite" generation.
- The rewrite workflow must analyze structure first, then rewrite, then remove AI flavor, then output multiple versions.
- Load reusable instructions from `skills/` and reusable prompt templates from `prompts/`.
- Inject user parameters, reference examples, direction, style profile, and AI analysis into templates.
- Reference examples are used to learn rhythm, tone, and structure, not to copy wording.
- Rewrites should fit education training, enrollment conversion, parents' decision contexts, short-video speech, and local-business communication.

## Safety Principles

- Avoid false promises, exaggerated score guarantees, "包过", "保过", "百分百", "稳赚不赔", and similar absolute claims.
- Do not over-manufacture fear or exploit parents' anxiety.
- Keep claims concrete, grounded, and usable for education enrollment communication.
- Errors should return clear user-facing messages instead of crashing the local service.

## Code Principles

- Make small, compatible changes.
- Prefer existing project patterns and plain Node.js APIs.
- Keep frontend controls simple and visible; advanced settings should not block the main workflow.
- Add SQLite columns with `ALTER TABLE` only when missing.
- Keep exports stable and additive.
