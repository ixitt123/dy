---
name: ffmpeg-render-engine
description: 使用本地 FFmpeg 将 Timeline Project 渲染为第一版 MP4 成片。
---

# FFmpeg Render Engine

## 输入

- Timeline Project。
- 已复制到输出包的图片素材。
- 已复制到输出包的音频素材。
- `subtitles.srt`。
- 分辨率、fps、比例和运动参数。

## 输出

- 1080x1920 或平台预设分辨率 MP4。
- 带轻微推拉缩放效果的图片视频片段。
- 合成 TTS 音频和烧录字幕。
- 渲染错误和输出路径。

## 禁止事项

- 不在缺图或缺音频时强行渲染。
- 不修改原始素材文件。
- 不依赖远程渲染服务作为第一版默认能力。
- 不吞掉 FFmpeg 错误日志。

## 成功标准

- 每个镜头按 Timeline 时长生成视频片段。
- 最终 MP4 使用 H.264/AAC，30fps，`yuv420p`。
- 输出文件可从页面打开目录。
- 失败时任务状态为 `failed` 且写明原因。

## 错误处理

- FFmpeg 不存在时直接阻塞。
- 单个片段渲染失败时终止任务并保留已生成包。
- 字幕烧录失败时写入 FFmpeg 错误，后续可提供不烧字幕降级策略。

## 可扩展 Provider

- GPU 加速 Provider。
- 复杂转场 Provider。
- 字幕模板 Provider。
- 云渲染 Provider。

## 与现有模块的关系

- 使用 Video Product Center 生成的 Timeline 和素材包。
- 与 Jianying Draft Exporter 并列为 Output 阶段。
- 复用系统设置中的 FFmpeg 路径。
