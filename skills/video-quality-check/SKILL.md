---
name: video-quality-check
description: 对视频成片输出进行可播放性、字幕、音频和素材完整性检查。
---

# Video Quality Check

## 输入

- Timeline Project。
- 输出目录。
- MP4、SRT、manifest 和素材文件列表。

## 输出

- 质量检查报告。
- 可阻塞发布的问题列表。
- 可继续优化的建议项。

## 禁止事项

- 不自动删除失败视频。
- 不修改原始导演稿和原始素材。
- 不把检查建议当成实际已修复结果。
- 不跳过缺文件、黑屏、无音频等硬性问题。

## 成功标准

- 能确认 MP4 是否存在且可读取。
- 能确认字幕文件存在并包含时间码。
- 能确认音频素材存在。
- 能检查 Timeline scene 是否全部有可用素材或明确 blocker。

## 错误处理

- 检查工具不可用时写入 warning，不误报通过。
- 文件不存在时写入 failed check。
- 检查过程异常时保留原输出目录并记录错误。

## 可扩展 Provider

- FFmpeg 黑屏检测。
- 音频响度检测。
- 字幕安全区检测。
- 平台发布规范检测。

## 与现有模块的关系

- 下游读取 Video Product Center 输出。
- 可在路线 A/B/D MP4 完成后自动运行。
- 可为 VFO QA Review 提供本地证据。
