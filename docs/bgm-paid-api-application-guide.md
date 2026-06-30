# BGM Paid API Application Guide

## Goal

The project should prefer BGM providers that are easy for a China-based operator to purchase, invoice, and renew. For this reason, the primary paid candidates are domestic commercial music platforms that usually support Alipay, WeChat Pay, bank transfer, or enterprise contract payment.

Do not enable automatic commercial BGM publishing only because an API key is present. A track must still have stored license metadata before it can be used automatically in a publishable draft.

## Recommended Order

1. HIFIVE 音加加 / 曲多多
2. Vfine Music
3. 看见音乐 STARLINK
4. 腾讯音乐音乐云
5. Mubert API, only when overseas card payment and AI-generated music licensing are acceptable
6. Jamendo, only as a free backup with license review

## Provider Notes

### HIFIVE 音加加 / 曲多多

- Settings key: `bgmProviders.hifive`
- Unified provider id: `hifive_bgm`
- Official site: https://open.haifanwu.com/
- Best use: short-video editing tools, online creation tools, ecommerce, enterprise self-media, app/mini-program integration.
- Payment fit: domestic provider; ask sales for Alipay, WeChat Pay, bank transfer, and fapiao support.
- Pricing standard: the official site describes API/SDK usage and supports usage-based billing and annual-package billing. Final price depends on scenario, catalog size, API traffic, platform, term, and commercial rights.
- What to request:
  - API/SDK access for short-video or online editing tool usage.
  - Search, audition, download, BPM/tag/mood metadata, and license certificate APIs.
  - License scope for Douyin, video accounts, Xiaohongshu, Bilibili, commercial ads, and client delivery.
  - Whether generated videos may be exported to Jianying/CapCut drafts.
  - Whether each track can return machine-readable license metadata.

### Vfine Music

- Settings key: `bgmProviders.vfine`
- Unified provider id: `vfine_bgm`
- Official site: https://www.vfinemusic.com/
- Best use: commercial video, ads, enterprise content, brand campaigns.
- Payment fit: domestic provider; ask sales for Alipay, WeChat Pay, bank transfer, and fapiao support.
- Pricing standard: usually quoted by project, track package, usage scope, platform, region, term, and whether API access is included.
- What to request:
  - Commercial BGM API or enterprise service access.
  - Search/audition/download/license certificate workflow.
  - Rights for short-video publishing and client commercial delivery.
  - A clear rule for derivative videos and batch generation.

### 看见音乐 STARLINK

- Settings key: `bgmProviders.kanjian_starlink`
- Unified provider id: `kanjian_starlink_bgm`
- Official site: https://open.kanjian.com/
- Best use: platform-level music asset access, scene music, short-drama soundtrack, distribution, global commercial music assets.
- Payment fit: domestic provider; ask sales for Alipay, WeChat Pay, bank transfer, and fapiao support.
- Pricing standard: usually enterprise/API cooperation. Price depends on usage type, asset catalog, calls/downloads, territories, term, and sublicensing rights.
- What to request:
  - API/SDK access for soundtrack usage.
  - Scene tags, mood, BPM, duration, instrumental/vocal filter, and license data.
  - Commercial usage rights for short-video exports.
  - Whether user-facing sublicensing is allowed.

### 腾讯音乐音乐云

- Settings key: `bgmProviders.tme_opencloud`
- Unified provider id: `tme_opencloud_bgm`
- Official site: https://opencloud.tencentmusic.com/index
- Best use: enterprise commercial catalog, copyright protection, custom music, music business solutions.
- Payment fit: domestic enterprise provider; ask sales for Alipay, WeChat Pay, bank transfer, and fapiao support.
- Pricing standard: enterprise/business cooperation. Price usually depends on catalog scope, platform, traffic, duration, custom work, and rights package.
- What to request:
  - Commercial catalog or custom BGM API access.
  - Metadata and authorization certificate output.
  - Short-video export rights for Douyin and other Chinese platforms.
  - Copyright protection and dispute support.

### Mubert API

- Settings key: not enabled as a domestic primary provider yet.
- Official site: https://mubert.com/api
- Best use: generated BGM by prompt, mood, BPM, genre, image, or duration.
- Payment fit: overseas provider; not preferred if Alipay/WeChat Pay is required.
- Pricing standard: tiered API generations, including 5K / 30K / unlimited generations per month shown on the official API page. Check the current pricing page before purchase.
- Note: Good for automatic 120-150 BPM generation, but domestic payment and licensing review may be inconvenient.

## Fee Standard Cheat Sheet

Use this when asking sales for a quote:

- `scenario`: short-video creation tool / internal marketing tool / commercial client delivery / app or SaaS platform.
- `platforms`: Douyin, WeChat Channels, Xiaohongshu, Bilibili, Kuaishou, website, offline screen.
- `rights`: background music only, commercial ads, client delivery, sublicensing to end users.
- `usage`: monthly API calls, monthly downloads, monthly generated videos, expected DAU/MAU.
- `catalog`: instrumental BGM only, vocal songs, SFX, hot songs, global catalog, Chinese catalog.
- `term`: monthly, yearly, project-based, perpetual certificate.
- `territory`: Mainland China only, global, overseas social platforms.
- `proof`: whether every selected track returns license URL, license certificate, author, source, and usage scope.
- `payment`: Alipay, WeChat Pay, bank transfer, fapiao, contract entity.

## Integration Rules

- API keys and secrets stay in local `settings.json`; never commit them.
- Automatic matching can only use a track when sidecar metadata marks it as `authorized` or `attribution_required`.
- Unknown, personal-only, trial-only, or noncommercial tracks cannot be used automatically.
- Every imported track must write sidecar JSON with provider, source id, title, artist, BPM, mood, tags, license, license URL, commercial use, and authorization status.
- BGM should match TTS duration and stay under voiceover volume.
