---
name: video-quality-review
description: 对最终 MP4 做发布前质检，不合格时必须失败并输出原因。
---

# Video Quality Review

## 输入

- Final MP4。
- Timeline Project。
- 字幕、音频、BGM、素材和渲染报告。

## 输出

- `render_report.json` 中的 quality review。
- 合格/不合格状态。
- 失败原因和可修复建议。

## 禁止事项

- 不允许没有检查就标记成功。
- 不允许黑屏、空白、无音频、无字幕仍然通过。
- 不允许把 warning 当作 passed。
- 不允许删除用户素材。

## 成功标准

- MP4 存在且可读取。
- 分辨率 1080x1920，比例 9:16。
- 有音频、有 BGM、有字幕。
- 字幕在安全区内，语音和字幕基本同步。
- 无黑屏、无空白片段、无缺失素材，总时长和文件大小合理。

## 错误处理

- FFmpeg/ffprobe 不可用时写入 warning，但硬性文件检查仍执行。
- 缺文件或黑屏直接 failed。
- 检测异常时保留原视频并写入错误。

## 可扩展 Provider

- FFmpeg blackdetect/silencedetect。
- VLM 画面检查。
- 响度 LUFS 检测。
- 平台发布规范检测。

## 与现有模块的关系

- 接收 `ffmpeg-final-render` 输出。
- 通过后交给 `publish-package-maker`。
- 与现有 `skills/video-quality-check` 兼容，未来可合并。
