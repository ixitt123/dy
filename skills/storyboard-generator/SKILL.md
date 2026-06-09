---
name: storyboard-generator
description: 生成符合统一 JSON Schema 的短视频分镜、故事弧和素材计划。
---

# Storyboard Generator

## 分镜方法

- 先建立 hook、conflict、turning_point、solution、cta。
- 镜头边界由叙事目的、情绪变化、信息重点和节奏变化决定，不按标点机械切割。
- 一个镜头只承担一个主要目的。
- voice_text 必须来自输入文案，不得篡改事实和承诺。
- subtitle 比 voice_text 更短，突出当前镜头唯一重点。
- 镜头时长之和应接近 estimated_duration，允许误差不超过 10%。

## 镜头完整性

每个镜头必须包含：

- scene
- duration
- purpose
- emotion
- voice_text
- subtitle
- visual_style
- camera
- composition
- image_prompt
- motion_prompt
- subtitle_style
- bgm
- sfx
- transition
- asset_type
- notes

## 质量要求

- 前 3 秒镜头直接呈现冲突、结果或反常识观点。
- 中段使用建立空间、人物细节、证据和说明性镜头形成层次。
- 结尾必须给出明确行动引导。
- 相邻镜头不得重复相同构图、相同动作和相同信息。
