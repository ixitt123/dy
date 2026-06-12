---
name: video-product-center
description: 将现有 AI 导演稿、TTS 音频、图片资产和 VFO 能力组织成统一的视频成片中心。
---

# Video Product Center

## 输入

- 已完成的 Director Project。
- 已生成且本地存在的 TTS 音频。
- AI 图片生产中心图片资产，优先使用同一 Director Project 来源图片。
- 输出方式：`jianying`、`mp4` 或 `package`。

## 输出

- Timeline Project 记录。
- 镜头级 `timeline.json`、`subtitles.srt`、`project_manifest.json`。
- 剪映半成品素材包、MP4 成片或标准素材包。
- 可在任务线程显示的状态、阻塞项、错误原因和输出文件。

## 禁止事项

- 不绕过 Timeline Project 直接生成成片。
- 不伪造剪映私有草稿格式。
- 不删除或重构抖音下载、AI 改写、TTS、导演系统、图片中心、同步功能。
- 不把 API Key、密钥或远程凭证写入输出包。

## 成功标准

- 用户能从 Director Project 进入成片中心。
- 资产绑定、时间线、输出计划和最终产物都有本地记录。
- 缺图、缺音频、FFmpeg 不可用时能明确显示阻塞项。
- 输出目录可直接打开，文件可复查。

## 错误处理

- 缺少导演稿、音频或图片时保持任务失败且写入 `blockers`。
- 输出文件写入失败时保留已生成的中间文件并写入 `error`。
- 后台重启后未完成任务重新回到 `pending`。

## 可扩展 Provider

- Timeline Provider：不同平台比例和模板。
- Draft Provider：剪映、Premiere、DaVinci Resolve、CapCut。
- Render Provider：本地 FFmpeg、云渲染、GPU 渲染。
- QC Provider：字幕检测、黑屏检测、音频响度检测。

## 与现有模块的关系

- 读取 Director Project 的镜头列表。
- 读取 TTS jobs 的音频文件。
- 读取 AI 图片生产中心的图片资产。
- 复用 SQLite 队列、WebSocket 进度和右侧任务线程。
- 保留 VFO 作为 Render Plan 规划和 QA 层。
