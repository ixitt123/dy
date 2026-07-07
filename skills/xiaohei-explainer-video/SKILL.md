---
name: xiaohei-explainer-video
description: 将用户给的一段中文文案、文章、口播稿或说明文字，制作成“导演稿 + Seedance VFX 合约 + Ian 小黑配图提示 + HyperFrames 说明视频工程”的完整流程。用户只要说“给这段文案做说明视频”“用小黑/Ian 风格做视频”“按导演稿做 HyperFrames 视频”“加 Seedance VFX 效果”“把文案做成讲解动画”，都应该优先使用本 skill，即使用户没有明确点名 skill。
---

# Xiaohei Explainer Video

## 目标

把一段文案变成可执行、可审查、可渲染的中文说明视频工程。这个 skill 固化以下链路：

```text
用户文案
→ Director System 导演稿
→ Storyboard JSON
→ Seedance VFX contract
→ Ian 风格正文配图/镜头提示
→ HyperFrames HTML composition
→ lint / validate / inspect / optional render
```

优先做成可落地的 HyperFrames 项目，而不是只给建议。只有当用户明确说“先只要导演稿/只要脚本/不要生成视频工程”时，才停在中间层。

## 需要配合的能力

使用本 skill 时，按需读取并遵循这些能力：

- 项目内 `skills/director-system/SKILL.md`：导演稿第一阶段规则。
- 项目内 `skills/storyboard-generator/SKILL.md`：统一分镜字段。
- 项目内 `prompts/xiaohei_explainer_video.md`：导演包输出模板。
- 已安装 `ian-xiaohei-illustrations`：正文配图逻辑、认知锚点、白底、短批注、怪诞隐喻。
- 已安装 `seedance-vfx`：每个镜头的效果来源、材质、路径、互动和终点。
- `hyperframes:hyperframes` 与 `hyperframes-cli`：HTML composition、GSAP 时间线、转场和检查命令。

如果某个 skill 不可用，继续用本 skill 的合同输出，但在最终说明里写明缺失项。

## 默认参数

用户没有指定时，使用：

- 语言：中文。
- 画幅：16:9 横版，1920x1080。
- 时长：30-60 秒，信息密度中等。
- 平台：通用短视频 / B 站 / 视频号均可裁切的横版说明视频。
- 风格：纯白画布、黑色手绘结构线、少量红/橙/蓝手写批注、原创 3D 动画感主角。
- 输出目录：`docs/<slug>-xiaohei-explainer/`。
- 本地渲染输出：`video-products/<slug>-xiaohei-explainer.mp4`，不要提交 GitHub。

## 角色系统：Xiaohei 2.0

旧“小黑”不能只是黑豆线稿。默认升级为一个原创 3D 动画感主角：

- 黑色或深炭色主体，圆润头身比例，软胶/绒感/收藏玩偶质感。
- 大而清澈的眼睛，表情认真、好奇、略带淘气，但不卖萌。
- 小短手、小短腿，动作要清楚：拉线、搬运、推门、调机器、擦掉多余节点、托住锚点。
- 造型要有识别度，但必须原创，不能复刻任何现有品牌角色或特定动画工作室风格。
- 不在最终 prompt 里写“Pixar”“Labubu”等品牌或 IP 名称；把用户的审美意图翻译成“cinematic 3D animated collectible character, soft vinyl texture, expressive eyes, playful but original silhouette”。
- 角色必须参与每个镜头的核心动作。如果去掉角色，镜头隐喻还能完全成立，就重写镜头。

更多角色细节见 `references/character-style.md`。

## 工作流

### 1. 消化文案

读取用户文案，先提炼：

- 核心观点。
- hook、pain、conflict、proof、solution、cta。
- 哪些段落承担认知转折。
- 哪些信息适合变成配图，哪些只适合字幕或旁白。
- 目标观众和平台节奏。

不要按句子平均切镜头。镜头边界由叙事目的、情绪变化和信息重点决定。

### 2. 生成 Director Package

先输出或保存两个中间层：

- `director-script.md`
- `storyboard.json`

每个镜头必须包含：

- `purpose`
- `emotion`
- `voice_text`
- `subtitle`
- `camera`
- `composition`
- `image_prompt`
- `motion_prompt`
- `transition`
- `vfx_contract`
- `xiaohei_action`

导演稿必须符合：

- 前 3 秒完成强钩子。
- 每个镜头只有一个主要叙事目的。
- 画面、角色、色调、字幕和转场统一。
- 不随机切句，不随机配图，不写无意义空镜。

### 3. 写 Seedance VFX Contract

每个镜头只允许一个 hero effect。按 `seedance-vfx` 的合同写清楚：

- effect source
- material
- motion path
- interaction with light
- interaction with objects
- dissipation
- endpoint
- stability constraints
- compact prompt-ready phrase

效果要服务叙事，不能只是炫。对角色脸、眼睛、文字和品牌信息附近的效果，放在周围而不是穿过核心身份锚点。

### 4. 写 Ian 风格配图提示

使用 `ian-xiaohei-illustrations` 的“认知锚点”和“怪诞但成立的隐喻”方法，但角色使用 Xiaohei 2.0：

- 保留：白底、大量留白、黑色手绘结构线、少量红/橙/蓝中文短批注。
- 保留：一张图/一个镜头只讲一个核心结构。
- 修改：主角不是丑线稿小黑，而是原创 3D 动画感收藏玩偶主角。
- 禁止：PPT、正式流程图、商业插画模板、真实 UI 截图、密集解释、品牌 IP 复刻。

镜头配图提示要能直接交给图像生成模型，也要能转译为 HyperFrames CSS/HTML 绘制元素。

### 5. 建 HyperFrames 项目

在 `docs/<slug>-xiaohei-explainer/` 创建：

- `AGENTS.md`
- `DESIGN.md`
- `director-script.md`
- `storyboard.json`
- `index.html`
- `package.json`

`DESIGN.md` 必须先定义视觉身份，再写 `index.html`。HyperFrames composition 必须遵守：

- standalone `index.html` 直接在 body 放 `data-composition-id` 根节点。
- 每个 timed element 使用 `data-start`、`data-duration`、`data-track-index`。
- GSAP timeline 必须 `{ paused: true }` 并注册到 `window.__timelines["main"]`。
- 多场景必须有转场；每个场景必须有 entrance animation。
- 转场前不要让旧场景先淡出或飞走，转场负责离场。
- 不使用 `Math.random()`、`Date.now()`、`repeat: -1`。
- 不让文本溢出，不让按钮/标签/字幕互相遮挡。

如果角色用 CSS 绘制，优先做成圆润、可爱的 3D 感：层次、眼睛高光、软阴影、柔和边缘。若要生成 bitmap 角色或配图，保存到本地资产目录，但不要提交大体积素材。

### 6. 检查与渲染

创建或修改 HyperFrames 后，至少运行：

```bash
npm run check
```

或等价命令：

```bash
npx hyperframes lint
npx hyperframes validate
npx hyperframes inspect
```

修复所有 hard errors。对比度警告要处理；布局溢出要修。单文件过大的可维护性 warning 可以保留，但最终说明要提到。

如果用户要求“做视频/生成视频/给我成片”，渲染到忽略目录：

```bash
npx hyperframes render --quality standard --output ../../video-products/<slug>-xiaohei-explainer.mp4
```

### 7. 交付口径

最终回复包含：

- skill 使用了哪些输入和默认参数。
- 修改/生成文件列表。
- Director 稿路径、Storyboard JSON 路径、HyperFrames 项目路径。
- 检查命令和结果。
- 若已渲染：本地 MP4 路径、时长、大小。
- 若已启动预览：Studio URL。
- 若提交：commit id、push 结果。

## 质量门槛

如果出现以下问题，重写镜头或改 HTML：

- 角色像旧版丑线稿、贴纸或装饰物。
- 角色像某个已有 IP 或特定动画工作室角色。
- 画面变成 PPT 流程图。
- 中文批注太多、太长或不可读。
- VFX 没有来源、没有路径、没有终点。
- 每个镜头都在重复同一种构图。
- 前 3 秒没有明确钩子。
- HyperFrames 检查有 error 或布局溢出。

## 测试提示

真实使用前，可以用 `evals/evals.json` 里的提示做人工检查。这个 skill 偏审美和工作流，优先人工看输出质量；只有文件结构、字段完整性、HyperFrames 检查结果适合做硬性评估。
