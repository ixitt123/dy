---
name: douyin-cleanup-auditor
description: Identify unused code, stale generated data, duplicate downloads, browser profiles, and obsolete artifacts in douyin-mcp-local while protecting repair evidence, databases, settings, fixtures, historical outputs, projects, and user assets. Use to prepare reversible quarantine or deletion decisions.
---

# Douyin Cleanup Auditor

Treat every cleanup candidate as required until evidence proves otherwise. Default to inventory and quarantine planning, not deletion.

## Protect first

Never classify these as disposable solely because they are untracked, old, large, or currently unreferenced:

- `.data/repair-evidence`, release evidence, backups, manifests, and repair registers;
- SQLite databases, WAL/SHM sidecars, `settings.json`, secrets, voices, fixtures, user assets, projects, and historical outputs;
- regressions or browser/media fixtures omitted from the current package runner;
- compatibility routes or formats that may still be consumed by historical data;
- anything inside the MoneyPrinterTurbo submodule, which is out of scope.

## Build the candidate inventory

1. Capture branch, HEAD, Git status, size, timestamps, hashes, owner module, and provenance.
2. Search production imports, dynamic imports, routes, string-based loaders, HTML/script tags, tests, scripts, package commands, documentation, and persisted references.
3. Trace runtime creation and cleanup logic. Confirm that no live process owns a temporary profile or output.
4. Separate exact duplicates with a verified outside copy from unique historical files.
5. Assign `保留`, `待补门禁`, `可隔离候选`, or `禁止处理`; never label a candidate `可删除` before quarantine verification.

## Require four deletion gates

1. **No reference:** no static, dynamic, runtime, persisted, packaging, or historical compatibility consumer remains.
2. **Not protected:** the target is outside every protected class and outside the MoneyPrinterTurbo submodule.
3. **Quarantine verification:** after an explicitly approved reversible move, targeted checks, full repository gate, real browser journey, applicable media checks, and restart recovery all pass.
4. **Recovery proof:** the manifest contains original path, quarantine path, size, SHA-256, reason, owner, verification results, and an independently checked restore procedure.

Permanent deletion requires separate explicit authorization after all four gates pass. Do not delete in the inventory phase.

## Report

Produce a candidate table with confidence, references searched, duplicate-copy evidence, protected status, proposed quarantine location, required checks, restore steps, and current decision. Quantify only reclaimable bytes supported by hashes; keep unique files protected.
