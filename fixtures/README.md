# 固定复现输入与输出目录 ｜ 00.04

> 本目录是维修编号 `00.04` 的交付物。为串稿、TTS、BGM、四条生产线（CS1、小黑、MoneyPrinter、动态大字）提供固定复现输入，供后续维修编号（02.x–08.x）的回归测试使用。

## 场景与 fixture 清单

| 场景 | fixture 路径 | 对应维修编号 | 用途 |
|---|---|---|---|
| 串稿（跨任务草稿覆盖） | `rewrite-crossover/input.json` | 02.01–02.06 | 任务 A/B 切换、80ms 恢复、刷新、重新打开 |
| TTS（旁白生成） | `tts/input.json` | 04.01–04.12 | 固定文案 + 语音参数，生成旁白音频 |
| BGM（背景音乐） | `bgm/input.json` | 04.02–04.12 | 固定 BGM 风格 + 时长 + 音量 |
| CS1 生产线 | `cs1/input.json` | 08.01–08.04 | 模板 + 三件套/四件套引用 |
| 小黑视频生产线 | `xiaohei/input.json` | 07.01–07.07 | 场景 + 图片 + BGM + 倍速 |
| MoneyPrinter 生产线 | `moneyprinter/input.json` | 05.01–05.07 | 脚本 + TTS + BGM + 素材 |
| 动态大字生产线 | `kinetic-text/input.json` | 06.01–06.06 | 文本 + 背景 + BGM |
| 服务重启恢复 | `restart/input.json` | 01.04、05.05、09.06 | 固定 handoff/job/asset 与最终文件映射 |

## 媒体引用策略

文本类 fixture 直接内联在 `input.json` 中。媒体类 fixture（音频、图片、视频）采用引用方式：

- **已有媒体引用**：指向 `.data/audio-reference/` 或 `assets/` 下已存在的小文件，避免重复存储。
- **占位媒体**：当无合适已有文件时，在 `input.json` 中标注 `"placeholder": true`，后续维修编号开始时补充真实媒体。
- **期望输出**：`expected/` 目录存放期望输出特征（如时长、响度、文件存在性），不存放大文件。

## 使用规则

1. 后续维修编号的回归测试应优先使用本目录的固定 fixture，不得用随机或临时输入。
2. 修改 fixture 需在对应维修编号的证据中说明原因。
3. fixture 是测试数据，应纳入版本控制（`fixtures/` 不在 `.gitignore`）。提交策略见 `docs/audit-00.03-auto-sync-2026-07-31.md`。
