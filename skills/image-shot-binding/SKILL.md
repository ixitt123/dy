---
name: image-shot-binding
description: 将 AI 图片生产中心的图片资产按镜头顺序绑定到 Timeline scene。
---

# Image Shot Binding

## 输入

- Director Project id。
- Director scene 列表。
- AI 图片资产库。
- 用户手动替换的镜头图片绑定。

## 输出

- scene 级 `image_asset_id` 和 `image_path`。
- 缺失图片阻塞项。
- 可人工调整的镜头图片列表。

## 禁止事项

- 不下载外部图片作为默认行为。
- 不用不存在的路径占位。
- 不覆盖用户手动选择的镜头图片。
- 不改变 Director scene 顺序。

## 成功标准

- 优先绑定 `source_type=director` 且 `source_id=projectId:sceneIndex` 的图片。
- 没有精准匹配时按可用图片池顺序绑定。
- 每个镜头都能在前端查看缩略图和替换图片。
- 缺图时明确显示阻塞项。

## 错误处理

- 图片资产库为空时阻塞。
- 图片文件不存在时跳过并阻塞对应镜头。
- 手动绑定 id 无效时回退自动匹配。

## 可扩展 Provider

- 语义相似度图片匹配 Provider。
- 图片质量评分 Provider。
- 人物/品牌一致性 Provider。
- 多图镜头选择 Provider。

## 与现有模块的关系

- 读取 AI 图片生产中心 `image_assets`。
- 输出给 Timeline Project。
- 被前端视频成片中心用于自动匹配和手动替换。
