---
name: voice-library
description: 管理可长期复用的声音资产，包括预设、克隆、收藏、最近使用、默认音色与版本关系。
---

# 声音资产库

## 数据范围

- 预设音色：由现有 Provider Adapter 注册。
- 克隆音色：保存参考音频、远程 voice_id、描述、标签和版本。
- 收藏音色：使用 SQLite 标记，不复制资产。
- 最近使用：按 `last_used_at` 和 `use_count` 排序。
- 默认音色：全库只允许一个有效默认项。

## 工作流程

1. 上传参考音频到本机 `voices/samples/`。
2. 校验格式、大小和声音授权确认。
3. 通过现有 Provider Adapter 创建或登记 voice_id。
4. 将资产写入 SQLite `voices`。
5. 生成测试样音后更新 `preview_path` 和最近使用时间。
6. 新版本创建新记录，并保存 `parent_voice_id` 与递增版本号。

## 安全规则

- 参考音频、预览音频和克隆资料默认不得提交 GitHub。
- 不在日志、错误、导出文件或 metadata 中保存 API Key。
- 删除操作默认归档本地资产，不自动删除远程平台音色。
- 未确认声音授权时禁止调用声音复刻接口。
