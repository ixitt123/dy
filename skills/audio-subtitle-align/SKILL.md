---
name: audio-subtitle-align
description: 将 TTS 音频与导演稿字幕对齐，产出可渲染的 SRT 和 Timeline subtitle track。
---

# Audio Subtitle Align

## 输入

- TTS job 或音频资产 ID。
- Timeline scenes 的旁白和字幕文本。
- 可选 ASR 结果、句子时长或停顿配置。

## 输出

- `subtitles.srt`。
- `tracks.subtitles`。
- 每个 scene 的 `start_time`、`end_time`、`duration` 校准结果。

## 禁止事项

- 不修改旁白含义。
- 不丢弃原字幕文本。
- 不把音频文件复制到非项目输出目录。
- 不把真实 API Key 写入字幕或 metadata。

## 成功标准

- 字幕时间不重叠、不倒退。
- 第一条字幕从 0 秒或非常接近 0 秒开始。
- 最后一条字幕不明显超过音频总时长。
- MP4 渲染和剪映半成品都能复用同一份 SRT。

## 错误处理

- 音频不存在时写入 blocker。
- 无法探测音频时长时使用文本估算，并在 metadata 标注。
- SRT 写入失败时任务进入 `failed`。

## 可扩展 Provider

- FFmpeg/ffprobe 时长探测。
- ASR 精确切句。
- TTS Provider 原生时间戳。
- 字幕安全区和断句优化 Provider。

## 与现有模块的关系

- 读取 TTS 页面生成的音频记录。
- 更新 Timeline Project 的字幕轨道。
- 被路线 A/B/C/D 的输出包和 MP4 渲染共同使用。
