---
name: script-to-shotlist
description: 将用户脚本拆成可渲染的商业短视频分镜时间轴。
---

# Script To Shotlist

## 输入

- 用户脚本、Director Project 或 TTS 文案。
- Premium Video Director 输出的整体风格规则。
- 平台比例、目标时长、语速或真实音频时长。

## 输出

```json
{
  "title": "",
  "ratio": "9:16",
  "resolution": "1080x1920",
  "total_duration": 0,
  "shots": [
    {
      "shot_id": 1,
      "start_time": 0,
      "end_time": 3,
      "duration": 3,
      "voice_text": "",
      "caption": "",
      "caption_keywords": [],
      "visual_prompt": "",
      "motion_type": "zoom_in|pan|cut|push|pull|none",
      "transition": "cut|flash|slide|zoom|fade",
      "emotion": "",
      "asset_type": "image|video|digital_human"
    }
  ]
}
```

## 禁止事项

- 不随机切句，不打乱脚本逻辑。
- 不让镜头时间重叠、倒退或空白。
- 不在此阶段调用图片、语音或视频生成 Provider。
- 不输出没有字幕、没有画面目标或没有运动信息的镜头。

## 成功标准

- Shotlist 从 0 秒开始，时间连续。
- 每个镜头都有旁白、字幕、关键词、视觉提示、运动和转场。
- 总时长匹配脚本长度或真实音频时长。
- 可直接进入 Asset Binding 和 Timeline Project。

## 错误处理

- 脚本为空时输出失败原因。
- 时长不足时合并镜头，时长过长时拆分镜头。
- 关键词为空时从字幕中提取高冲击词。

## 可扩展 Provider

- LLM 分镜 Provider。
- ASR/TTS 时间戳 Provider。
- 平台节奏模板 Provider。
- 账号历史爆款结构 Provider。

## 与现有模块的关系

- 可接现有 AI 导演 `storyboard`。
- 输出可映射到 `timeline_scenes`。
- 下游交给 `image-shot-binding`、`voice-timing-align` 和 `ffmpeg-final-render`。
