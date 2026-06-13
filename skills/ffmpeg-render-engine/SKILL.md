---
name: ffmpeg-render-engine
description: 基于 Timeline Project 使用本地 FFmpeg 渲染竖屏或横屏 MP4。
---

# FFmpeg Render Engine

## 输入

- Timeline Project。
- 已打包的图片、视频和音频素材。
- `subtitles.srt`。
- 分辨率、fps、比例和输出路线。

## 输出

- 1080x1920、1920x1080 或平台预设分辨率 MP4。
- 渲染中间片段目录 `.segments`。
- 任务进度、错误原因和最终 `mp4_path`。

## 禁止事项

- 不在缺素材时输出假 MP4。
- 不覆盖其他项目的输出目录。
- 不调用 Seedance 视频生成。
- 不把 API Key 或本地配置写进视频 metadata。

## 成功标准

- 路线 B 图片按镜头时长生成视频片段，并有轻微推拉缩放。
- 路线 A 有模板背景、标题、字幕和进度条。
- 路线 D 使用下载素材切段、加新配音和字幕。
- 输出 MP4 可播放，且前端可打开输出目录。

## 错误处理

- FFmpeg 缺失时立即失败并写入 error。
- 单个片段渲染失败时保留已生成中间文件。
- 字幕滤镜失败时明确提示字幕路径或编码问题。

## 可扩展 Provider

- GPU 编码 Provider。
- 云渲染 Provider。
- 模板动效 Provider。
- 画质检查 Provider。

## 与现有模块的关系

- 使用 `ffmpeg-static`。
- 读取 Video Product Center 的输出包。
- 渲染结果写回 Timeline Project 的 `mp4_path`。
