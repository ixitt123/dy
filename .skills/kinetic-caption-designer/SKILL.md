---
name: kinetic-caption-designer
description: 生成高级竖屏动态字幕，优先输出 ASS 字幕而不是普通 SRT。
---

# Kinetic Caption Designer

## 输入

- Timeline subtitle track。
- 关键词、情绪点、金句和 CTA。
- Premium Video Director 的字幕规则。

## 输出

- `subtitles.ass`。
- 字幕样式：字号、颜色、描边、安全边距、关键词高亮。
- 可选 SRT 兼容文件。

## 禁止事项

- 不允许只生成普通白字 SRT 就宣称高级字幕。
- 不允许字幕越过平台安全区。
- 不允许字体过小、无描边、无重点词。
- 不允许大段文字遮挡主体。

## 成功标准

- 竖屏大字字幕清晰可读。
- 关键词可用金色/高亮/放大样式突出。
- 字幕有安全边距、黑色描边和自动换行。
- 结尾金句或 CTA 能以大字卡形式输出。

## 错误处理

- 字幕过长时自动断行。
- 关键词缺失时从字幕中抽取强情绪词。
- ASS 烧录失败时输出失败原因，并保留 SRT 作为兼容文件。

## 可扩展 Provider

- 字幕关键词模型。
- 字幕安全区检测。
- 平台字体模板。
- 动态字幕模板库。

## 与现有模块的关系

- 替代现有路线 A/B/D 的普通 SRT 烧录。
- 与 `voice-timing-align` 共用同一时间轴。
- 最终由 `ffmpeg-final-render` 烧录进 MP4。
