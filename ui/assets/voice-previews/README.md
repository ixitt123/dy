# Static voice preview cache

This directory stores shareable preset preview audio that can be committed with
the app. Playback checks these files before it falls back to local generated
cache, so another machine can preview the same preset voice without generating
audio again.

File names are stable SHA-1 prefixes derived from `provider:voice_id`, matching
`server/voices/voice-asset-service.js`.

Use this command after refreshing local preset previews:

```bash
node scripts/export-voice-preview-cache.mjs
```

Only export provider presets and music presets. Do not commit cloned voices,
user samples, API keys, SQLite files, or local settings.
