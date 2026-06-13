---
name: voice-timing-align
description: 根据真实配音时长校准镜头、字幕和语音，防止画面文字语音错位。
---

# Voice Timing Align

## 输入

- TTS job 或音频资产。
- Shotlist 或 Timeline scenes。
- 字幕文本、旁白文本、可选 ASR 时间戳。

## 输出

- 校准后的 shot start/end/duration。
- 字幕时间轴。
- 音频匹配报告和同步风险。

## 禁止事项

- 不允许字幕明显提前或滞后。
- 不允许画面切完但语音还没说完。
- 不允许随机绑定与脚本不匹配的音频。
- 不允许把音频时长探测失败当作成功。

## 成功标准

- 每段字幕跟随对应语音出现。
- 每个镜头时长和旁白长度基本匹配。
- 音频和导演稿相似度过低时必须阻塞路线 A/B/C/D。
- Timeline 总时长贴近真实音频时长。

## 错误处理

- 音频文件不存在时输出 blocker。
- 无法探测音频时长时使用文本估算，并写入 warning。
- 音频文案和导演稿不匹配时失败，不随机套用。

## 可扩展 Provider

- FFmpeg/ffprobe。
- TTS 原生时间戳。
- ASR 强制对齐。
- 字幕断句优化模型。

## 与现有模块的关系

- 约束现有 Video Product Center 的 `audio_asset_id` 绑定。
- 输出可写入 `timeline_scenes` 和 `subtitles.srt/ass`。
- 服务于路线 A/B/C/D 的同步质量。
