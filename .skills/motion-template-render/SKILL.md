---
name: motion-template-render
description: 为一键成片提供商业短视频包装模板，包括片头、章节、信息卡、转场和封面。
---

# Motion Template Render

## 输入

- Timeline Project。
- Premium Video Director 视觉规则。
- Shotlist、标题、关键词、CTA、平台。

## 输出

- 片头标题卡。
- 章节卡、信息卡、重点金句卡。
- 底部品牌条、动态背景、转场动画、片尾引导关注。
- 封面模板参数。

## 禁止事项

- 不允许做静态 PPT 风格。
- 不允许所有镜头一个背景板到底。
- 不允许文字过多遮挡主体。
- 不允许模板风格和视频主题冲突。

## 成功标准

- 开头 3 秒有明确钩子和视觉冲击。
- 中段有节奏变化、重点词和信息层级。
- 片尾有 CTA。
- 封面能表达标题和利益点。

## 错误处理

- 缺少图片素材时可输出纯模板路线 A，但必须标记不是图文成片。
- 模板素材缺失时使用本地 FFmpeg 绘制的基础高级包装，不假装使用外部模板。
- 文字溢出时缩短标题或拆成两行。

## 可扩展 Provider

- 本地模板库。
- HTML/Canvas 模板渲染。
- After Effects/Premiere 模板。
- 云端动效渲染 Provider。

## 与现有模块的关系

- 升级路线 A `template_mp4`。
- 可为路线 B/D 增加片头片尾和封面。
- 输出交给 `ffmpeg-final-render` 拼接。
