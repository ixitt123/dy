---
name: douyin-media-acceptance
description: Verify real audio, video, subtitle, image, preview, download, and production-line handoff behavior in douyin-mcp-local. Use for any repair or release claim involving TTS, BGM, subtitles, CS1, Xiaohei, kinetic text, exported media, or the main program's MoneyPrinterTurbo integration boundary.
---

# Douyin Media Acceptance

Prove user-visible media behavior with real artifacts. Do not treat source inspection or mocked output as delivery evidence.

## Establish the acceptance target

1. Read the active item in `C:\Users\Admin\Desktop\02-短视频软件第二轮彻底修复执行总表.md`.
2. Read `.agents/skills/douyin-safe-change/SKILL.md` and the functional baseline.
3. Trace the real UI action, API route, job, persisted asset identity, preview URL, and download URL.
4. Keep MoneyPrinterTurbo internals out of scope; verify only the main program's startup, payload, polling, final-asset, preview, and download integration.

## Produce real evidence

1. Use an isolated, non-sensitive fixture and record its source path and hash.
2. Trigger the real UI or supported API path; record request ID, entity ID, revision, job ID, and timestamps.
3. Wait for the actual terminal job state. A percentage or source-code branch is not completion.
4. Save evidence under `.data/repair-evidence/<item-id>/<timestamp>/`.
5. Record the final file path, size, SHA-256, MIME/container, duration, streams, codecs, and readability.
6. For audio/video, inspect with FFprobe or the repository media checker. Verify non-zero playable duration and expected audio/video streams.
7. For subtitles, verify timestamps, ordering, encoding, export, reload, and alignment with the accepted audio.
8. In a real browser, prove the visible player loads and plays the same final asset revision that download/export returns.
9. For every three-asset result, prove the final mix lacks the configured BGM signature; for every four-asset result, prove the final file contains the expected BGM signature. An independent BGM file or manifest entry is insufficient.
10. Record the current task ID and verify narration/BGM duration, loudness, fade-out, subtitle alignment, asset ID, preview hash, and download hash against that same task.

## Verify integration invariants

- Confirmed TTS audio remains the canonical downstream input where required.
- Three-asset and four-asset labels match the files actually transferred.
- Preview, download, history, and downstream handoff resolve to the same asset identity.
- Refresh, retry, page switch, and process restart do not replace the current task with stale output.
- A blocked paid/login/external call is recorded as `未真实验证`; it never becomes a simulated pass and must not block unrelated repair lanes.

## Report

List the exact command or UI path, artifact paths, hashes, media measurements, browser evidence, upstream/downstream checks, blocked external evidence, and historical-output scope. Declare completion only when every applicable real-use assertion passes.
