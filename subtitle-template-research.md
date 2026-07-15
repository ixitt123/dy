# 2026 现代短视频字幕模板研究与采用记录

更新时间：2026-07-15

## 硬性筛选规则

- 视觉参考只接受 2022-01-01 之后发布或仍在 2024–2026 产品中实际使用的样式。
- 不采用 Aegisub 时代模板、2018 YouTube 字幕、老式大描边、廉价发光、随机弹跳和逐字乱飞。
- “老技术”只能作为底层确定性渲染器使用，不得成为视觉来源。当前项目继续使用 FFmpeg/libass 烧录，是为了让预览时间轴与正式 MP4 可重复；所有排版和动效方向来自 2024–2026 样本。
- 首批模板必须有真实时间轴输入、正式导出和明确来源；不以换色、换字体凑数。

## 2024–2026 视觉样本结论

| 样本 | 近年公开证据 | 可复用的现代规律 | 不采用的部分 |
| --- | --- | --- | --- |
| [CapCut Auto Captions](https://www.capcut.com/tools/auto-caption-generator) | 2026 官方页面展示 Trending、Highlight、Glow、Aesthetic、AI style captions，并支持字体、颜色、效果和 motion | 低成本模板选择、卡片化预览、短语页、关键词高亮、自适应底卡 | 品牌名、具体商业模板资产、夸张 Glow |
| [Captions - Choosing a Caption Style](https://captions.ai/help/guides/engagement/choosing-a-style) | 2026-04-20 官方指南；75+ 模板；教育类建议简洁字体、最小动画、短语显示；激励类使用粗体和 active-word color | 教育/口播分流、当前词状态、AI emphasis、短语分组、模板实时预览 | 未公开源码与品牌专有模板 |
| [Submagic](https://www.submagic.co/) / [Templates API](https://docs.submagic.co/api-reference/templates) | 当前产品支持 templateName、动画、背景、高亮、emoji、布局和多语言 | 短语节奏、关键词强调、稳定的口播中心区 | 直接复刻创作者命名模板、emoji 堆叠 |
| [Klap](https://klap.app/) | 2025–2026 产品强调品牌模板、字幕定制和多平台重构 | 模板与内容/时间轴解耦、切换模板不破坏字幕 | 缺少可复用字幕源码，因此只作产品交互参考 |
| [OpusClip Captions](https://www.opus.pro/captions) | 2025–2026 官方页面强调动态字幕、关键词、品牌模板、安全位置；API 有 Fancy Karaoke 预设 | karaoke sweep、字框宽度、圆角背景、平台安全区 | 品牌专有预设代码 |
| Alex Hormozi 官方 YouTube Shorts | 取样：2026-07-15《200 Actions a Day for 60 Days》 | 每页 2–5 词、白色主句、黄色只强调语义重点、胸口附近稳定位置、极少装饰 | 直接使用人物姓名作为模板名 |
| Ali Abdaal 官方 YouTube Shorts | 取样范围锁定 2026 最新视频 | 教程型短语、干净字重、重点词选择性强调 | 旧年份频道样本 |
| Diary of a CEO 官方 YouTube Shorts | 取样范围锁定 2026 最新视频 | 访谈说话人层级、双行正文、避开人物面部 | 节目品牌元素 |
| OpenAI 官方视频 | 只取 2024–2026 发布会和产品视频 | 编辑部式单句、克制进入、留白、信息层级 | 品牌字体和 logo |
| Apple 官方视频 | 只取 2024–2026 发布会和产品视频 | 极简底部字幕、精细字距、无多余动画、标题卡片 | 品牌字体和产品宣传资产 |

## 成熟源码与渲染方案筛选

### 1. Remotion 官方 TikTok Captions Template

- 项目名称：Remotion TikTok Captions Template
- 项目地址：https://github.com/remotion-dev/template-tiktok
- 技术栈：React、Remotion 4、`@remotion/captions`、Whisper
- 许可证：Remotion License；个人、非营利和不超过 3 人的营利组织可免费，较大组织需要商业许可
- 最近维护状态：本地核验 HEAD `386ec6a`，提交日期 2026-02-20
- 已有字幕效果：字幕分页、逐词 token、spring 进入、TikTok 风格当前词
- 中文：支持；官方模板说明非英语可切换 Whisper 模型
- SRT：Remotion Captions 官方包提供 `parseSrt()`
- 逐词时间轴：支持 `TikTokPage.tokens` 的 `fromMs/toMs`
- 商业使用：有组织规模限制，风险必须单独评估
- 可直接复用代码位置：`src/CaptionedVideo/SubtitlePage.tsx`、`Page.tsx`
- 需要改造：不把 Remotion runtime 直接打包进当前项目；只采用分页、spring、逐词状态机思想，避免引入商业许可约束
- 真实演示：仓库 `public/sample-video.mp4`
- 最终采用：部分采用，作为 `word-highlight`、`phrase-pop` 的时间状态和短语分页来源

### 2. remotion-captions-themes

- 项目名称：remotion-captions-themes
- 项目地址：https://github.com/vshukla7/remotion-captions-themes
- 技术栈：React 18、Remotion 4、TypeScript
- 许可证：MIT，Copyright 2026 Vinayak Shukla
- 最近维护状态：本地核验 HEAD `c2cfe29`，提交日期 2026-06-23；npm 版本 1.0.8
- 已有字幕效果：Pop、Karaoke、Kinetic、Podcast、Soft AI、Simple One Word 等独立组件
- 中文：组件按字符串渲染，支持中文；部分英文专用词形算法不适合中文
- SRT：不直接解析 SRT，接收 `CaptionsData.lines[].words[]`
- 逐词时间轴：原生 `WordTiming {text,start,end,emphasis}`
- 商业使用：MIT 允许，但其 peer dependency Remotion 仍需单独评估
- 可直接复用代码位置：`src/themes/pop.tsx`、`karaoke.tsx`、`podcast.tsx`、`src/utils/useWordTiming.ts`
- 需要改造：移除浏览器 transition；把帧状态机移植到当前确定性 renderer；删除不适合中文的英文词形和伪随机布局
- 真实演示：仓库 `assets/captions_sample_compressed.mp4` 和 `test-player`
- 最终采用：采用 MIT 时间逻辑和四类结构；不直接依赖其 Remotion runtime

### 3. Revideo

- 项目名称：Revideo
- 项目地址：https://github.com/redotvideo/revideo
- 技术栈：TypeScript、Motion Canvas 派生渲染器、React UI
- 许可证：MIT
- 最近维护状态：本地核验 HEAD `a0b158b`，提交日期 2026-07-09，release 0.11.0
- 已有字幕效果：它是成熟程序化视频底座，不提供可直接选用的 10 套现代字幕模板
- 中文 / SRT / 逐词：引擎可实现，但仓库没有可直接产品化复用的字幕模板库
- 商业使用：MIT 允许
- 可复用代码位置：renderer、player、timeline 基础设施
- 需要改造：接入成本高，需要重写当前 UI 和导出链
- 真实演示：官方 docs 与示例项目
- 最终采用：首批不采用；列为未来统一视频渲染器候选

### 4. Twick

- 项目名称：Twick React Video Editor SDK
- 项目地址：https://github.com/ncounterspecialist/twick
- 技术栈：React、TypeScript、Canvas、云端字幕/导出包
- 许可证：Sustainable Use License 1.0，不等同于 MIT/Apache
- 最近维护状态：本地核验 HEAD `3044c23`，提交日期 2026-05-07
- 已有字幕效果：AI caption generation、caption track、编辑器和 MP4 export
- 中文 / SRT / 逐词：数据层可支持，需要进一步验证具体组件
- 商业使用：许可证约束需要法务审查
- 可复用代码位置：`@twick/cloud-transcript`、`@twick/cloud-caption-video`
- 需要改造：许可证与现有无 React 主界面不匹配
- 真实演示：README 中官方 subtitles demo
- 最终采用：不采用

### 5. 当前项目 FFmpeg/libass 渲染链

- 技术栈：Node.js、FFmpeg、libass、Canvas 正式预览
- 许可证：沿用项目现有依赖；不新增模板商业运行时
- 最近维护状态：当前项目生产链
- 中文 / SRT：原生支持；当前项目已有 SRT 解析与 UTF-8 字体配置
- 逐词时间轴：本次已把确认后的 TTS `wordTimeline` 直接接入，不再重新估时
- 商业使用：无新增 Remotion/SUL 运行时风险
- 需要改造：旧 24 效果注册表、固定 1920×1080、预览与导出双轨逻辑
- 最终采用：作为正式生产渲染底座；视觉和状态逻辑来自上述 2022+ 成熟实现及当前产品样本

## 最终首批 10 套

| ID | 通用名称 | 结构差异 | 时间轴 | 主要来源 | 首批状态 |
| --- | --- | --- | --- | --- | --- |
| `rolling-focus` | 滚动聚焦 | 上下文三层队列，当前句放大，整体滚动 | 句级 | CapCut 当前歌词/聚焦布局 + 确定性时间状态 | 已接入 |
| `word-highlight` | 逐词聚焦 | 短语不动，当前词颜色和尺度变化 | 逐词优先 | Remotion 官方 TikTok + PopTheme | 已接入 |
| `karaoke-sweep` | 流光跟读 | 连续左到右填充，不是逐字跳色 | 必须逐词 | KaraokeTheme + libass `\kf` | 已接入 |
| `center-statement` | 编辑部金句 | 单句居中、留白、轻位移和淡入 | 句级 | OpenAI/Apple 2024–2026 | 已接入 |
| `keyword-emphasis` | 重点词冲击 | 主句稳定，命中重点词时单独放大 | 逐词优先 | Captions/Submagic AI emphasis | 已接入 |
| `phrase-pop` | 短语节拍 | 2–5 词成组切换，非逐字乱飞 | 逐词优先 | 2026 创作者样本 + Remotion page/spring | 已接入 |
| `dialogue-two-line` | 双人访谈 | 说话人标签 + 双行正文 + 底卡 | 句级/逐词 | PodcastTheme + 2026 访谈样本 | 已接入 |
| `documentary-minimal` | 纪录片极简 | 安全区底部、轻字重、低干扰 | 句级 | Apple/OpenAI 近年克制字幕 | 已接入 |
| `caption-card` | 自适应卡片 | 文字决定卡片尺寸，标题层级清楚 | 句级/逐词 | CapCut/Captions/OpusClip 当前卡片 | 已接入 |
| `keyword-tags` | 知识点标签 | 主句 + 关键词胶囊，布局稳定 | 句级/逐词 | Captions/OpusClip/Submagic 当前关键词 UI | 已接入 |

## 被废除的旧实现

- 原 24 个 `beat-word-pop`、`glitch-jitter`、`neon-pulse`、`scatter-assemble` 等效果已从注册表移除。
- 旧效果只有一个手写 token 引擎，主要差异是颜色、字号、方向和 ASS tags，不满足独立模板标准。
- 旧浏览器假缩略图动画不再用于模板卡片；新卡片只播放由正式渲染链生成的 `preview.mp4`。
- 旧 Motion Canvas JSON 只是描述文件而非真实渲染；现在导出的描述明确标记 `ffmpeg-libass-deterministic`，不再冒充 Motion Canvas 成片。

## 已知限制与后续扩展

- 说话人头像区域需要上游提供头像素材；首批只实现说话人名称和当前说话人层级。
- `keyword-emphasis` 在只有句级时间轴时会使用静态重点词；有逐词时间轴时才按朗读时间触发。
- libass 圆角底卡属于视觉近似；若未来需要复杂蒙版和真实圆角，可迁移到 Revideo，但不影响首批正式导出。
- 新增模板只需注册新定义和 renderer mode，不修改 TTS、字幕内容或时间轴主流程。
