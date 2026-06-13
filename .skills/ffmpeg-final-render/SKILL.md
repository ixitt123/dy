---
name: ffmpeg-final-render
description: 使用本地 FFmpeg 完成最终成片合成，输出可发布的竖屏 MP4。
---

# FFmpeg Final Render

## 输入

- Timeline Project。
- 图片/视频素材、配音、BGM、SFX、ASS 字幕、模板片头片尾。
- 平台分辨率、fps、比例和输出目录。

## 输出

- `final.mp4` 或路线对应 MP4。
- 中间片段、混音文件、ASS/SRT、渲染报告。

## 禁止事项

- 不允许缺素材时输出假成片。
- 不允许输出黑屏、空白片段或无音频视频。
- 不允许只有配音和普通字幕。
- 不允许调用 Seedance 视频生成。

## 成功标准

- 图片转视频、视频片段拼接、配音合并、BGM 混音、音效叠加、ASS 字幕烧录都在 Render Plan 中可追踪。
- 输出 1080x1920、30fps、MP4。
- 片头片尾、字幕、转场和进度条按 Timeline 执行。
- 输出可直接进入质检和发布包。

## 错误处理

- FFmpeg 不可用时立即失败。
- 任一片段渲染失败时保留错误日志。
- 字幕、音频或视频滤镜失败时明确写入失败原因。

## 可扩展 Provider

- GPU 编码 Provider。
- 云渲染 Provider。
- 音频响度处理 Provider。
- 画面质量增强 Provider。

## 与现有模块的关系

- 升级现有 `ffmpeg-render-engine`。
- 被 Video Product Center 路线 A/B/D 调用。
- 输出交给 `video-quality-review` 和 `publish-package-maker`。
