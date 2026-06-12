---
name: jianying-draft-export
description: 从 Timeline Project 导出剪映可参考的半成品素材包，稳定优先，不伪造私有草稿格式。
---

# Jianying Draft Export

## 输入

- Timeline Project。
- 镜头图片文件。
- TTS 音频文件。
- 字幕轨。
- 输出目录。

## 输出

- 草稿输出文件夹。
- `media/images/` 图片副本。
- `media/audio/` 音频副本。
- `timeline.json`。
- `subtitles.srt`。
- `project_manifest.json`。
- `draft_content.json` 和 `draft_meta_info.json` 参考文件。

## 禁止事项

- 不伪造剪映私有数据库或加密格式。
- 不写绝对路径作为唯一引用，包内文件需相对可读。
- 不把缺失素材静默跳过。
- 不删除用户原素材。

## 成功标准

- 用户能把素材、SRT 和 timeline 信息人工导入剪映继续加工。
- 输出包结构清晰，可跨电脑同步。
- Timeline、字幕、图片和音频一一对应。
- 若未来接入真实剪映草稿格式，该 Skill 可向后兼容当前标准包。

## 错误处理

- 复制素材失败时终止并记录错误。
- 字幕为空时仍生成合法空 SRT 文件。
- 输出目录冲突时使用项目 id 和安全标题命名。

## 可扩展 Provider

- 剪映真实草稿 Provider。
- CapCut Provider。
- Premiere XML/EDL Provider。
- DaVinci Resolve FCPXML Provider。

## 与现有模块的关系

- 第一阶段优先路线：导演稿 + 图片 + 音频 → 剪映半成品素材包。
- 读取 Timeline Project，不直接读取原始导演稿。
- 输出文件进入文件资产和任务线程。
