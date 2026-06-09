---
name: tts-domestic
description: 国内供应商优先的语音合成实验室，统一处理文案准备、Provider 适配、队列、SQLite 与试听。
---

# 国内 TTS 实验室

## 默认顺序

1. 阿里云百炼 CosyVoice / Qwen-TTS
2. 火山引擎豆包语音
3. 腾讯云 TTS
4. 自定义 Provider
5. MiniMax
6. Fish Audio
7. ElevenLabs

## 执行流程

1. 从本地 `settings.json` 读取 Provider 配置，不把密钥发送到前端。
2. 使用 `prompts/tts_script_prepare.md` 清洗文案、切句并处理停顿。
3. 使用 `prompts/tts_emotion_prompt.md` 规范情绪与风格提示。
4. 通过统一 Provider Adapter 调用语音平台。
5. 将任务状态、参数、忽略项和结果写入 SQLite `tts_jobs`。
6. 将成功生成的音频保存到本地 TTS 输出目录，并通过受控接口试听。

## 安全约束

- API Key 和 Secret 只能保存在本地 `settings.json`。
- 日志、响应、错误详情、导出数据不得包含密钥。
- 声音复刻前必须确认用户拥有声音授权。
- Provider 不支持的参数应忽略并写入 `metadata_json`，不能因此让任务崩溃。
- 前端只提交统一参数，不直接调用任何平台接口。

## 第一阶段

- 完成阿里云百炼 CosyVoice / Qwen-TTS HTTP Provider。
- 火山引擎和腾讯云保留统一 Adapter 占位。
- 支持预设音色、手动 `voice_id`、语速、情绪、风格、音量、音高、mp3/wav、试听和 SQLite 记录。
- 声音复刻入口只显示阶段状态，不实际提交复刻。
