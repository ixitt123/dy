---
name: image-shot-binding
description: 将 AI 图片资产或下载素材绑定到 Timeline scene，形成可渲染的视频轨道。
---

# Image Shot Binding

## 输入

- Timeline scenes。
- 图片资产库中的 AI 图片。
- 下载素材库中的视频文件。
- 可选手动绑定关系 `manual_bindings`。

## 输出

- scene 的 `image_asset_id`、`image_path` 或视频素材 metadata。
- `tracks.video`。
- 缺图、缺素材或匹配失败的 blockers。

## 禁止事项

- 不删除原始图片或下载视频。
- 不跨项目误改已有资产记录。
- 不在此阶段调用图片生成 Provider。
- 不把不属于项目输出目录的文件当作已打包结果。

## 成功标准

- 路线 B/C 每个 scene 都能找到图片，或明确列出缺图镜头。
- 路线 D 每个 scene 都能找到下载视频素材，或明确提示缺素材。
- 手动绑定优先于自动匹配。
- 输出包中有可复查的素材副本。

## 错误处理

- 图片文件不存在时标记该 scene 为 `blocked`。
- 下载视频不存在时标记路线 D 任务失败。
- 绑定数量不足时可循环使用素材，但必须保留来源信息。

## 可扩展 Provider

- 语义匹配 Provider。
- 视觉相似度 Provider。
- 素材安全审核 Provider。
- 平台画幅裁切 Provider。

## 与现有模块的关系

- 上游读取图片中心和抖音下载素材库。
- 下游写入 Timeline scene 和视频轨道。
- 与 AI 导演的 `image_prompt`、`motion_prompt` 保持映射。
