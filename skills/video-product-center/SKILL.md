---
name: video-product-center
description: 统一组织 Director Project、资产绑定、Timeline Project、Render Plan 和最终输出的视频成片中心工作流。
---

# Video Product Center

## 输入

- 已完成的 Director Project。
- 已生成并存在本地的 TTS 音频。
- 图片资产库、下载素材库或模板背景素材。
- 输出路线：路线 A `template_mp4`、路线 B `mp4`、路线 C `jianying`、路线 D `mix_mp4`、标准素材包 `package`。

## 输出

- SQLite 中的 Timeline Project 任务记录。
- `timeline.json`、`subtitles.srt`、`project_manifest.json`。
- 剪映半成品素材包、AI 图文 MP4、模板快剪 MP4、混剪 MP4 或标准素材包。
- 右侧任务线程可见的当前步骤、已完成步骤、阻塞项、输出文件和错误原因。

## 禁止事项

- 不绕过 Timeline Project 直接生成成片。
- 不伪造剪映私有工程格式。
- 不写死 API Key，不把密钥写入输出包。
- 不删除或破坏抖音下载、AI 改写、TTS、导演系统、图片中心和同步功能。
- 不接入 Seedance 视频生成。

## 成功标准

- 所有生成任务先进入 SQLite 队列，再进入绑定、构建、渲染或导出状态。
- 缺少导演稿、音频、图片或下载素材时，任务失败但明确写入 blocker。
- 成功任务必须有输出目录，且核心文件可打开、可复查。
- 前端能从路线 A/B/C/D 清晰选择并看到进度。

## 错误处理

- 输入不足时写入 `blockers_json` 并标记 `failed`。
- FFmpeg、文件复制、字幕写入失败时写入 `error` 和 `completed_at`。
- 服务重启后未完成任务回到 `pending`，等待重新处理。

## 可扩展 Provider

- Draft Provider：剪映、CapCut、Premiere、DaVinci Resolve。
- Render Provider：本地 FFmpeg、云渲染、GPU 渲染。
- Timeline Provider：不同平台比例、模板和节奏规则。
- QC Provider：黑屏检测、字幕检测、音量检测和画面安全区检测。

## 与现有模块的关系

- 上游读取 Director Project、TTS Jobs、图片资产库和下载素材库。
- 中间统一写入 Timeline Project 与 Timeline Scenes。
- 下游交给剪映半成品导出、FFmpeg 渲染和视频质量检查。
- 复用现有 SQLite、WebSocket 进度广播、输出目录打开和自动同步。
