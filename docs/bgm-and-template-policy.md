# BGM and Jianying Template Policy

## BGM Rules

- Manual local BGM is always highest priority. The user is responsible for confirming the file is owned, purchased, licensed, CC0, public domain, Pixabay-licensed, or otherwise cleared for commercial publishing.
- Automatic local matching only uses BGM assets whose sidecar metadata marks the asset as authorized or attribution-required.
- Unknown, personal-only, or noncommercial music is not used by automatic matching.
- Auto matching prefers 120-150 BPM and scores by script keywords, route style, filename, mood, tags, and declared BPM.
- If no legal local BGM is available, the system generates a local basic rhythm bed. It is marked as `generated_default` in `render_report.json`, `timeline.json`, and `project_manifest.json`.

## BGM Sidecar Metadata

Place a JSON file next to the music file:

```json
{
  "bpm": 128,
  "mood": "premium business knowledge",
  "tags": ["business", "knowledge", "dark", "loop"],
  "license": "Pixabay Content License",
  "license_url": "https://pixabay.com/service/license-summary/",
  "source": "pixabay",
  "commercial_use": true,
  "authorized": true
}
```

Supported sidecar names:

- `track.mp3.json`
- `track.json`
- `track.bgm.json`

## API Candidates

- Pixabay Music: best first candidate for free commercial-use music discovery. Store the source URL, author, license link, BPM when available, and downloaded file metadata. Official reference: https://pixabay.com/service/license-summary/
- Freesound: better for SFX and short loops, but the free API terms are non-commercial. Commercial API usage needs separate permission, and every downloaded asset still needs license filtering. Official references: https://freesound.org/docs/api/resources_apiv2.html and https://freesound.org/docs/api/terms_of_use.html
- Jamendo: useful catalog and API, but commercial video usage can require explicit licensing. Treat as review-required unless a project-specific license is stored. Official reference: https://developer.jamendo.com/v3.0

## Jianying Template Rules

Do not copy random CapCut/Jianying templates from the internet into this repository unless the license explicitly allows redistribution inside source code.

The repository ships built-in template presets as code:

- `education_tips`
- `black_gold_business`
- `clean_knowledge_card`
- `promo_commercial`
- `enrollment_conversion`
- `campus_education`
- `8_14_83`

These presets control generated draft behavior:

- title card
- CTA card
- dynamic caption style
- transition pattern
- image motion
- color filter
- target BGM BPM

Real Jianying master drafts can still be imported by the user into `templates/jianying/<template_id>/draft_template/`.
