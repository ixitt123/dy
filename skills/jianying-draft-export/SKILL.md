---
name: jianying-draft-export
description: 导出稳定可人工导入或参考的剪映半成品素材包，不伪造剪映私有工程。
---

# Jianying Draft Export

## 输入

- Timeline Project。
- 已绑定的图片、音频和字幕。
- 输出目录。

## 输出

- `timeline.json`。
- `subtitles.srt`。
- `project_manifest.json`。
- `draft_content.json` 和 `draft_meta_info.json` 参考文件。
- `media/images`、`media/audio`、可选 `media/videos`。

## 禁止事项

- 不伪造剪映私有草稿数据库或私有工程格式。
- 不删除用户原始素材。
- 不把真实 API Key 写入任何导出文件。
- 不承诺剪映一键无损打开私有工程。

## 成功标准

- 输出目录结构稳定。
- 素材、字幕、时间线和 manifest 都能人工复查。
- 剪映人工导入时能按 timeline 参考继续加工。
- 任务完成后前端可打开输出目录。

## 错误处理

- 文件复制失败时写入 error。
- 缺图或缺音频时不输出伪完整包，改为 failed 和 blockers。
- 写入 JSON 失败时停止任务并保留已复制素材。

## 可扩展 Provider

- 剪映公开导入格式 Provider。
- CapCut XML/FCPXML Provider。
- Premiere XML Provider。
- DaVinci Resolve EDL Provider。

## 与现有模块的关系

- 是路线 C 的第一版核心输出。
- 读取 Timeline Project、图片中心和 TTS 音频。
- 下游可接视频质量检查或人工剪映加工。
