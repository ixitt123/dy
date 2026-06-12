---
name: video-quality-check
description: 对 Timeline、剪映素材包和 MP4 输出进行本地质量检查。
---

# Video Quality Check

## 输入

- Timeline Project。
- 输出包文件列表。
- 可选 MP4 文件。
- 阻塞项、错误日志和平台预设。

## 输出

- QA 检查结果。
- 缺失素材、字幕异常、时长异常、输出文件异常的错误原因。
- 可回写到任务线程的质量状态。

## 禁止事项

- 不替用户自动删除输出文件。
- 不为了通过检查而篡改导演稿。
- 不把审美判断和硬性文件检查混为一谈。
- 不忽略已知阻塞项。

## 成功标准

- Timeline scene 数量、字幕条数、视频轨数量一致。
- 图片、音频、SRT、manifest 均存在。
- MP4 存在时可探测到时长、尺寸和编码。
- 问题能在右侧任务线程直接看到。

## 错误处理

- 文件不存在时报阻塞。
- FFmpeg 探测失败时标记为警告或失败。
- QA 未通过时不覆盖原输出，只写入检查结果。

## 可扩展 Provider

- FFprobe 技术检查 Provider。
- 黑屏/静帧检测 Provider。
- 音频响度 Provider。
- 字幕遮挡 Provider。
- 平台发布合规 Provider。

## 与现有模块的关系

- 下游检查 FFmpeg Render Engine 和 Jianying Draft Exporter 的输出。
- 可复用 VFO 的审美复核和 render-readiness 规则。
- 结果展示在视频成片中心和 Codex 风格任务线程。
