# 双版本文案生成失败：根因与修复记录

- 检索时间：2026-08-10（Asia/Shanghai）
- 适用范围：家长触动与转化模板的“触动咨询版”和“行动号召版”生成链路。
- 本次分支：`fix/rewrite-multi-output-retry`

## 真实故障证据

页面会按顺序为两个版本分别调用 `/api/tasks/rewrite`。服务端每个版本依次执行初稿、去 AI 味、字数校准和连贯性质检。初始修复只在整个版本边界增加一次重试，真实运行虽然偶尔成功，但日志仍出现 `SyntaxError` 和质量检查错误；重新从两个空框生成时，也复现了“只保留触动咨询版，行动号召版为空”。因此重试只能缓解症状，不能作为根因修复。

## 根因

1. 四个阶段都要求模型返回 JSON，但调用 `chatCompletion` 时没有启用 `jsonMode`，实际请求缺少 `response_format: {"type":"json_object"}`。模型按普通文本输出，导致同一输入随机出现非法 JSON 或空内容。
2. DeepSeek 官方说明 JSON Output 仍可能偶发返回空内容。旧逻辑会在外层把整个版本从初稿开始重跑，成本高且仍可能连续失败。
3. 本地家长转化质量门只检查模型标注的单句 `conversionStructure.climax`。自然口播的高潮经常由相邻两三句共同构成，正文合格但模型把证据句标窄时，会被误判并丢弃整篇成品。

## 一手资料

1. DeepSeek JSON Output：<https://api-docs.deepseek.com/guides/json_mode/>
   - 必须传 `response_format: {"type":"json_object"}`，同时在提示中要求 JSON 并提供格式示例。
   - 应设置合理的 `max_tokens`，避免 JSON 中途截断。
   - JSON Output 偶发空内容是官方已知问题，可通过调整提示缓解。
2. DeepSeek Chat Completion：<https://api-docs.deepseek.com/api/create-chat-completion/>
   - `response_format=json_object` 保证模型消息为有效 JSON；默认值是普通文本。
   - `finish_reason=length` 代表输出可能被截断。
3. DeepSeek 官方错误码：<https://api-docs.deepseek.com/quick_start/error_codes/>
   - 429、500、503 属于可短暂等待后重试的上游故障。

## 最终方案

- 初稿、去 AI 味、字数校准、连贯性质检统一经过结构化输出边界，默认强制 JSON Output，并显式设置 4096 个最大输出 token。
- JSON 模式返回空内容或非法 JSON 时，只重做当前结构化阶段一次；第二次用更严格的 JSON 指令并避开官方已知的 JSON Mode 空内容路径，不再推倒整个版本链路。
- 质量门仍要求所有结构证据真实出现在正文中；高潮判断从“孤立单句”改为“高潮证据句及其相邻正文”，且排除后面的行动号召，避免将 CTA 误当高潮。
- 外层有限重试继续只处理上游临时故障和最终质量失败；不对配置、余额或确定性 4xx 重复请求。
- 不使用默认文案、假内容或放宽完整性检查来填充空框。

## 真实复验

- 完整根因修复加载后，从两个空框连续运行 3 次。
- 3 次均同时生成 `parentConsultation` 和 `parentAction`，每次均显示“改写完成”并写入 SQLite/Markdown。
- 最终运行日志：整篇级重试 0 次，`SyntaxError` 0 次。
- 最终持久化记录：2 个版本，正文长度分别为 143 和 193，`coherencePassed=true`，成品文件存在。
