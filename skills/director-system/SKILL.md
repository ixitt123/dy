---
name: director-system
description: 将短视频文案转化为可执行、可审查、可复用的专业导演稿，第一阶段不生成任何图片或视频。
---

# AI 导演系统

## 目标

把文案转化为 Storyboard JSON、Shot List、Visual Prompt、Motion Prompt、字幕时间轴、BGM 计划和审美复核，为后续素材生产与渲染提供统一中间层。

## 工作流

1. 识别 hook、pain、conflict、proof、solution、cta。
2. 确认视频类型、目标受众、平台比例和传播目标。
3. 选择单一主视觉风格，并确定色调、光线、字幕和构图规则。
4. 建立 story_arc，再按叙事目的分配镜头。
5. 每个镜头写明 purpose、emotion、voice_text、subtitle、camera 和 composition。
6. 再生成 image_prompt、motion_prompt、声音设计与转场。
7. 生成字幕时间轴与 BGM 计划。
8. 执行审美复核；低于 80 分时重写问题镜头。
9. 输出 JSON 与 Markdown 导演稿，不进入素材或视频生成。

## 硬规则

- 前 3 秒必须完成强钩子。
- 每个镜头必须有叙事目的。
- 画面、色调、人物、字幕和转场必须统一。
- 不允许随机切句、随机配图、无意义空镜和重复镜头。
- 不允许输出视频、图片、下载素材或渲染指令。
