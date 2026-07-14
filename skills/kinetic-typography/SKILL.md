---
name: kinetic-typography
description: 用于设计、筛选和实现短视频动态大字、歌词字幕、逐词跟读、爆点标题、金句定格、霓虹/故障/贴纸等文字特效。只要用户提到动态大字、文字特效、字幕动效、kinetic typography、歌词视频、短视频大字标题或要求升级文字动画库，就应使用本 skill。
---

# Kinetic Typography

本 skill 用来指导项目里的“动态大字视频”生产线。目标不是做装饰，而是让 TTS 的音频、文案、时间戳字幕驱动可预览、可渲染、可复用的短视频文字特效。

## 开源参考

- `iart-ai/kinetic-typography-skills`：MIT。参考其 split text、mask reveal、blur reveal、char/word/line stagger、title card 和歌词字幕技能结构。
- `vshukla7/remotion-captions-themes`：MIT。参考其 pop、karaoke、hustle、beast、gaming、soft-ai、kinetic layout 等字幕主题分类。
- Motion Canvas：项目已经依赖，适合后续把效果升级为更精确的视频级动画描述。

不要直接整包复制外部项目。把外部项目的分类、动效原则和时间节奏转成本项目自己的效果定义、预览规则和 FFmpeg/ASS 渲染规则。

## 输入契约

动态大字效果必须接收同一组绑定数据：

- `audio_path` 或 `audio_url`
- `script_path`
- `subtitle_path` 或 `timestamped_text_path`
- `subtitle_timeline`
- `title / seo_title`

字幕时间轴是主驱动。效果不能自己重新切字幕导致音频、文案、时间戳不一致。

## 选型规则

根据内容意图选效果：

- 口播解释：`逐词跟读高亮`、`整句上切入`、`极简跟随`
- 痛点/反问：`痛点砸入`、`疑问句弹窗`、`爆点词弹跳`
- 金句/结论：`金句定格`、`描边显影`、`高对比块字`
- 搞笑/搞怪：`贴纸弹出`、`故障抖动`、`散字聚合`
- 唱歌/节奏：`歌词波浪`、`逐词跟读高亮`
- 科技/课程：`柔光玻璃`、`模糊聚焦`
- 游戏/强刺激：`电竞闪光`、`霓虹发光`
- 长口播：`播客下三分之一`、`极简跟随`

## 动效质量规则

- 先保证静态排版可读，再加动画。
- 长句优先按词组或整句动，不要全句逐字乱飞。
- 逐字动画只用于短句、歌词、故障、波浪和散字聚合。
- 重点词最多 1-3 个，颜色和尺度可以加强，但不能遮挡整句阅读。
- 单条字幕一般 8-18 个中文字符最舒服，超过 24 字应拆句或使用整句/下三分之一效果。
- 入场总时长控制在 0.3-0.8 秒；字幕很短时更快，金句和聚焦类更慢。
- 每个效果必须同时支持页面 Canvas 预览和服务端 ASS/MP4 渲染。

## 效果库结构

每个效果至少包含：

- `id`
- `name`
- `description`
- `tokenMode`: `line | phrase | word | char`
- `layout`: `center | lower-third | stack | stairs | orbit | scatter | vertical | side-notes | impact`
- `motion`: `pop | karaoke | mask-rise | focus | slam | glitch | neon | block | slide | typewriter | wipe | wave | assemble | outline | elastic | fade`
- `primary / accent`
- `defaultParams`

## 实现顺序

1. 先更新 `server/kinetic-text/effects.js` 的效果定义。
2. 再更新服务端 `effectTags`、`splitDisplayTokens`、`tokenPosition`，保证素材包和 MP4 真实使用新效果。
3. 再更新前端 `tokenRows`、`drawToken`、`tokenPosition`，保证页面预览与 MP4 方向一致。
4. 最后更新 UI 文案和数量，不保留“13 种”这类旧占位描述。

## 验收

- 页面能看到完整效果库，不再只有 13 个占位卡。
- 任意效果切换后，预览能明显变化。
- 生成素材包和 MP4 不报错。
- `npm run check` 通过。
- 不引入 API Key、素材文件、`.data/` 或外部仓库源码到 Git。
