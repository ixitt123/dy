---
name: storyboard-to-timeline
description: 将 AI 导演分镜转换为统一 Timeline Project 的场景、时间段和轨道结构。
---

# Storyboard To Timeline

## 输入

- Director Project 基础信息。
- `director_scenes` 镜头列表。
- 平台预设：比例、分辨率、fps。
- 可选音频总时长或语音切句时长。

## 输出

- Timeline Project 基础字段。
- `scenes[]`，包含旁白、字幕、起止时间、时长、视觉提示词、运动和转场。
- `tracks.video`、`tracks.audio`、`tracks.subtitles`。

## 禁止事项

- 不改变导演稿原始语义。
- 不随机打乱镜头顺序。
- 不在此阶段生成图片、音频或视频。
- 不让时间轴出现重叠、负时长或空镜头。

## 成功标准

- 时间线从 0 秒开始且连续。
- 每个 scene 至少有 `scene_index`、`narration_text`、`subtitle_text`、`duration`。
- 总时长优先贴合音频时长，没有音频时按旁白长度估算。
- Timeline 可被资产绑定、剪映导出和 FFmpeg 渲染复用。

## 错误处理

- 导演项目不存在或未完成时输出阻塞项。
- 镜头列表为空时停止构建并写入失败原因。
- 时长异常时使用文本长度估算并记录 metadata。

## 可扩展 Provider

- 文本时长估算 Provider。
- TTS 切句对齐 Provider。
- ASR 精确对齐 Provider。
- 平台节奏模板 Provider。

## 与现有模块的关系

- 上游来自 AI 导演系统。
- 下游交给 Image Shot Binding、Audio Subtitle Align、Jianying Draft Export 和 FFmpeg Render Engine。
- 与 VFO Render Plan 并行互补，Timeline 是实际输出的统一中间层。
