---
name: premium-video-director
description: 锁定一键成片的整体商业短视频风格，负责统一后续分镜、画面、字幕、音乐和转场规则。
---

# Premium Video Director

## 输入

- 用户脚本或 Director Project。
- 目标平台、比例、时长、行业和账号定位。
- 可选参考风格、品牌关键词和禁用风格。

## 输出

```json
{
  "video_style": "高级短视频/黑金UI/电影感/知识口播/广告片",
  "tone": "专业、有冲击力、有节奏",
  "pacing": "快节奏",
  "visual_rules": [],
  "caption_rules": [],
  "music_rules": [],
  "transition_rules": []
}
```

## 禁止事项

- 不允许后续模块自由发挥成不同风格。
- 不允许输出普通 PPT、电子相册或只有字幕配音的低级成片方案。
- 不允许把 API Key、私密配置或本地绝对密钥路径写入结果。
- 不允许绕过 Director Project、Asset Binding、Timeline Project、Render Plan、Output 主链路。

## 成功标准

- 每条规则都能被分镜、图片、字幕、BGM、转场和渲染模块执行。
- 视觉、字幕、音乐和节奏有统一方向。
- 明确平台发布目标：抖音、视频号、小红书优先为 9:16 竖屏。
- 后续模块只能细化规则，不能推翻主风格。

## 错误处理

- 输入缺少平台时默认抖音 9:16。
- 脚本文案过短时输出阻塞项，要求补充主题、受众和 CTA。
- 风格冲突时保留最适合商业短视频转化的规则，并记录舍弃原因。

## 可扩展 Provider

- 文本模型 Provider：DeepSeek、DashScope、OpenAI、硅基流动、小米 MiMo。
- 风格库 Provider：账号模板、行业模板、品牌模板。
- 审美评分 Provider：本地规则、VLM 画面审查、人工评分。

## 与现有模块的关系

- 上游接收 AI 改写、AI 导演或手动脚本。
- 下游约束 `script-to-shotlist`、`visual-style-lock`、`kinetic-caption-designer` 和 `motion-template-render`。
- 与现有 `skills/director-system` 互补：本 Skill 决定高级成片总风格，原 Director 负责生成导演稿。
