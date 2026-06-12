---
name: audio-subtitle-align
description: 将 TTS 音频和导演稿字幕对齐到 Timeline，第一版支持按文本长度估算，后续支持切句和 ASR。
---

# Audio Subtitle Align

## 输入

- TTS job id 与本地音频路径。
- Director scene 的旁白和字幕。
- 可选 TTS 切句时间。
- 可选音频探测时长。

## 输出

- 每个 scene 的 `start_time`、`end_time`、`duration`。
- `tracks.audio`。
- `tracks.subtitles`。
- `subtitles.srt`。

## 禁止事项

- 不丢弃导演稿字幕。
- 不把字幕烧录作为唯一输出，必须保留独立字幕轨。
- 不强行 ASR；没有精确时间时使用稳定估算。
- 不让字幕轨与视频轨脱节。

## 成功标准

- 字幕进入 Timeline。
- SRT 时间合法、递增且无重叠。
- 有音频时总时长接近音频时长。
- 无音频时返回明确阻塞项。

## 错误处理

- 音频文件不存在时阻塞。
- FFmpeg 探测失败时退回文本估算。
- 空字幕时使用旁白文本兜底。

## 可扩展 Provider

- TTS 切句 Provider。
- Whisper/ASR 对齐 Provider。
- 字幕断句 Provider。
- 字幕样式 Provider。

## 与现有模块的关系

- 读取 TTS jobs。
- 服务 Storyboard to Timeline。
- 输出给 Jianying Draft Exporter 和 FFmpeg Render Engine。
