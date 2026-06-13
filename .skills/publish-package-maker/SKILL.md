---
name: publish-package-maker
description: 生成可直接发布到抖音、视频号、小红书的发布包。
---

# Publish Package Maker

## 输入

- 通过质检的 final MP4。
- 封面、标题、描述、话题、渲染报告。
- 平台和账号定位。

## 输出

- `final.mp4`
- `cover.png`
- `title.txt`
- `description.txt`
- `hashtags.txt`
- `render_report.json`

## 禁止事项

- 不允许没有 final MP4 就输出发布包。
- 不允许只有脚本没有视频。
- 不允许把未通过质检的成片包装成可发布。
- 不允许写入 API Key 或本地敏感配置。

## 成功标准

- 发布包文件齐全。
- 标题、描述和话题贴合平台。
- 封面清晰表达主题。
- 用户可以直接检查并发布。

## 错误处理

- 缺少 final MP4 时失败。
- 封面生成失败时输出原因，不假装成功。
- 文案为空时从脚本和金句自动提取候选。

## 可扩展 Provider

- 封面模板 Provider。
- 标题生成 Provider。
- 平台标签推荐 Provider。
- 多平台发布适配 Provider。

## 与现有模块的关系

- 是“一键成片”的最终交付层。
- 读取 Video Product Center 输出目录。
- 未来可和自动发布、账号库、素材库连接。
