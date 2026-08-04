# Functional Baseline

Use this inventory to prevent a repair from silently deleting or breaking a working capability. A source-code symbol or button is not proof that the capability works; verify the applicable user journey.

## Product capabilities

| ID | Capability that must remain available | Minimum preservation check |
|---|---|---|
| F01 | Local startup, single instance, heartbeat, status, controlled shutdown | Start the UI, load status, close/reopen without corrupting state |
| F02 | URL collection, parsing, download, progress, pause, retry, delete | Complete one supported download and inspect the saved file |
| F03 | Local video selection and transcript/subtitle/audio extraction | Use a real local media fixture and open every output |
| F04 | Transcript library, correction, content analysis, reference examples | Save, reload, analyze, and reopen the same transcript |
| F05 | Copy rewriting, versions, manual edits, drafts, save, task switching | Run A/B task isolation, refresh, reopen, and TTS handoff |
| F06 | Moments copy original/rewrite modes, personas, emoji, image prompts, materials | Generate both modes and verify selected controls affect output |
| F07 | TTS providers, presets, cloned voices, retries, jobs, audio preview | Generate real audio, display the player, play, retry, and reload |
| F08 | Subtitle alignment, correction, timestamps, confirmation, SRT/text exports | Align real audio, edit, confirm, download, and reopen |
| F09 | Independent BGM generation, progress, preview, volume, duration, fade | Generate real BGM and verify visible playback and stored settings |
| F10 | Voice asset create, test, rate, default, version, archive, delete | Exercise lifecycle without losing parent/version relationships |
| F11 | Three/four-asset handoff, revision, selected targets, receipts | Send to all selected lines and verify received asset identities |
| F12 | CS1 templates, timeline, preview, render, BGM mix, export | Produce playable three-asset and four-asset MP4 files |
| F13 | Xiaohei scenes, illustration binding, one-click images, BGM, speed, render | Test images plus 1.0/1.1/1.2/1.3 outputs and synchronized tracks |
| F14 | MoneyPrinter service startup, materials, polling, preview, final render, download | Survive slow progress/restart and verify final BGM in the download |
| F15 | Kinetic-text project, background, editable timeline, BGM, render, package | Create, refresh, preview, render, download, and reopen a project |
| F16 | Project/asset library, type filters, detail, archive, send-to-project | Register, list, filter, open, and reuse each supported asset type |
| F17 | Task queue/list, progress, pause, retry, import, export, clear | Exercise lifecycle and confirm no unrelated task is changed |
| F18 | Project center, workflow, pipeline events, revisions, recovery | Create/update/reload and reject stale revision writes |
| F19 | Director projects, sources, generation, scenes, export, delete | Generate and reopen a project with stable scene ownership |
| F20 | APS/VFO planning, configuration, sources, projects, export | Run planning outputs without invoking disallowed generation stages |
| F21 | Image studio jobs/assets, generation/import, history, file serving | Produce or import an image, reopen it, and verify allowed paths |
| F22 | Settings, model/provider routing, secret handling, global reuse | Save concurrently, reload, and confirm secrets are not exposed |
| F23 | File download/open/delete and desktop-folder operations | Verify allowed paths and reject traversal or unrelated files |
| F24 | Git hooks, safe sync, branch/submodule consistency, clean release | Run gates without automatic pull/commit/push or hidden disk changes |

## Cross-capability invariants

1. One business entity has one authoritative persisted state.
2. Every asynchronous write carries entity ID, revision, and request ID.
3. An older task or revision cannot overwrite the current task.
4. UI text, API payload, storage schema, export, and tests change together.
5. A visible preview and a downloaded result resolve to the same asset revision.
6. Every completed media job has a readable output and a verification result.
7. Three-asset and four-asset terminology matches the actual files.
8. Refresh, page switching, process restart, and retry preserve the correct task.
9. Existing data remains readable until a tested migration and rollback exist.
10. Security validation is server-side and cannot be bypassed by direct API calls.

## Regression scope rule

For a changed capability, test:

1. the capability itself;
2. every producer that feeds it;
3. every consumer that receives its state or output;
4. every capability sharing selectors, localStorage, SQLite tables, JSON files, routes, settings, queues, or media helpers;
5. F01, F17, F22, and F24 as core smoke checks.

At each repair phase boundary and before release, verify all F01–F24.
