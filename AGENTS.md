# Codex 协作规则

## 工作方式

- 这台电脑是主要编辑端，尽量在本机 Codex 中完成项目修改。
- GitHub 仓库 `https://github.com/ixitt123/dy` 是唯一远程源。
- 其他电脑可以同步和应急编辑，但不要让两台电脑长时间同时改同一个文件。
- Codex 连接项目时，项目级 `SessionStart` hook 会先同步 GitHub 最新版本。
- Codex 一轮编辑停止时，项目级 `Stop` hook 会自动提交并推送。
- 如果同步失败、被跳过或发生冲突，先处理 Git 状态，再继续编辑。

## 自动同步

- `.codex/config.toml`：Codex 项目级 hooks 配置。
- `.codex/hooks/session-start-sync.mjs`：Codex 连接项目时先同步 GitHub 最新版。
- `.codex/hooks/stop-sync.mjs`：Codex 一轮编辑停止时自动上传。
- `安装开机自动同步.bat`：注册 Windows 登录后自动同步任务。
- `自动同步.vbs`：无窗口启动后台同步监控。
- `同步项目.bat`：手动立即提交、拉取、推送。
- `查看同步状态.bat`：查看 Git 状态和最近同步日志。
- `卸载开机自动同步.bat`：关闭并移除开机自动同步。

后台同步规则：

- 本地改动稳定约 30 秒后自动提交并推送。
- 每 1 分钟检查 GitHub 是否有新提交。
- 遇到冲突会停止，避免覆盖另一台电脑的改动。

## Git 同步规则

每次完成代码修改后：

1. 运行测试。
2. 确认无报错。
3. `git add -A`
4. `git commit -m "功能名称+时间"`
5. `git push origin main`

## 开始工作前

任何开发任务开始前：

1. 先执行 `git pull --ff-only origin main`。
2. 检查远程是否有更新。
3. 如果存在冲突，先解决冲突再开发。

## 开发原则

- 不允许直接删除核心代码。
- 修改前先分析影响范围。
- 优先保持向后兼容。
- 每次功能开发必须提交到 GitHub。

## 自动备份

所有代码修改完成后必须推送 GitHub。

禁止出现本地已修改但未同步情况。

## 输出要求

每次任务完成后输出：

- 修改文件列表。
- Git 提交信息。
- Push 结果。
- 是否同步成功。

## 多电脑协作规则

我有两台电脑（家里和公司）。

GitHub 是唯一代码源。

开发规则：

1. 每次开始工作前自动执行：
   `git pull --ff-only origin main`

2. 每次完成任务后自动执行：
   `git add -A`
   `git commit -m "自动备份"`
   `git push origin main`

3. 如果 push 失败：
   先 git pull，再处理可解决冲突，再 push。

4. 所有开发记录保存在 GitHub。

5. 不允许只保存在本地。

6. 每次完成任务后告诉我：
   是否已提交、Commit ID、Push 是否成功。

## 禁止上传的内容

不要把这些内容提交到 GitHub：

- `settings.json`
- `.data/`
- `downloads/`
- `node_modules/`
- SQLite 数据库和临时文件
- API Key、Secret、Cookie、Token
- 本地生成的大体积素材和导出文件

这些内容应该保留在各自电脑本地。

## 项目架构优先规则

这个项目采用：

- `AGENTS.md`
- `skills/`
- `prompts/`
- `config/`
- MCP

架构优先。

禁止直接堆代码。

先设计 Skill。

再设计 Prompt。

最后开发功能。

## TTS 国内供应商优先规则

1. 本项目 TTS 默认优先使用国内供应商。
2. 第一优先级为阿里云百炼 CosyVoice / Qwen-TTS。
3. 火山引擎豆包语音、腾讯云 TTS 依次作为国内扩展；海外 Provider 只作为扩展，不作为默认方案。
4. API Key、Secret 只允许保存在本地 `settings.json`。
5. 不允许在日志、导出文件、错误信息中暴露 API Key 或 Secret。
6. 语音克隆必须要求用户确认拥有声音授权。
7. 所有 TTS Provider 必须通过统一 Adapter 接口调用。
8. 不允许把某个平台 API 调用逻辑写死在前端。
9. 不允许破坏现有下载、文案提取、AI 改写、任务队列、SQLite 功能。
10. TTS 文案必须先经过 Prompt 约束的清洗、切句、情绪和停顿处理，再交给 Provider。

## 声音资产中心规则

1. 不为声音资产中心继续增加 Provider，统一复用现有 TTS Adapter。
2. 参考音频、克隆资料和试听音频默认只保存在本机 `voices/`，不得自动上传 GitHub。
3. 声音克隆必须再次确认用户拥有合法授权。
4. 声音资产、测试记录、评分和默认音色必须写入 SQLite，不允许只保存在前端。
5. 预设音色、克隆音色、收藏、最近使用和默认音色必须使用同一套资产数据。
6. 自动测试必须使用 `prompts/voice_test_script.md` 的五类脚本，不允许把测试文案写死在页面。
7. 默认音色可被 AI 改写后的“一键生成语音”流程复用。
8. 版本管理不得覆盖旧版本；新版本必须保留父版本关系。

## AI 导演系统规则

1. Director System 第一阶段只生成专业导演稿，不生成图片或视频。
2. 不允许直接把文案随机切成图片提示词；必须先分析传播结构、情绪和镜头目的。
3. 所有分镜必须服务于文案情绪、传播目标和目标平台。
4. 禁止廉价 PPT 风、AI 图库拼接风、企业宣传片模板风和土味招生广告风。
5. 每条视频必须保持视觉风格、色调、字幕和镜头语言统一。
6. 每个镜头必须说明 purpose，不允许无意义空镜和无意义转场。
7. Director Prompt 必须放在 `prompts/`，不得写死在业务代码里。
8. Director Skill、风格库、镜头语言和审美规则必须放在 `skills/`。
9. Director 项目、镜头、状态和评分必须写入 SQLite，并通过独立队列处理。
10. 不允许破坏现有下载、文案提取、AI 分析、AI 改写、TTS、声音资产中心和 SQLite 功能。

## APS 与 VFO 规则

1. Asset Planning System 只负责素材规划，不生成图片或视频，不调用图片 Provider。
2. VFO 只负责决策、调度、规划和质量控制，不直接生成图片或视频。
3. 工作流固定为：Storyboard → APS → VFO → Image Provider → Video Renderer → QA → Export。
4. 每个镜头必须说明素材类型、选择原因、生成或获取方式、渲染策略和质量检查项。
5. 素材分类、平台策略、渲染策略和 QA 规则必须来自 `skills/`、`prompts/` 和 `config/`，不得写死在前端。
6. APS 必须输出 Asset Package、Asset Review 和 Render Readiness。
7. VFO 第一阶段只输出 `render_plan.json`，不接图片 Provider、视频 Renderer 或自动导出成片。
8. 抖音、视频号、小红书和 B 站必须使用各自的平台信息密度、字幕、镜头时长和画幅策略。
9. APS 与 VFO 项目、镜头、评分和状态必须写入 SQLite，并通过独立队列处理。
10. 不允许破坏现有下载、提取文案、AI 改写、Director、TTS、声音资产中心及其 SQLite 数据。
