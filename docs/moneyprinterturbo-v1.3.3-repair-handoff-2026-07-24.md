# MoneyPrinterTurbo v1.3.3 升级与任务恢复修复交接

更新时间：2026-07-24

项目：`douyin-mcp-local`

主项目路径：`C:\Users\Admin\Desktop\短视频\douyin-video-tool-source-code\douyin-mcp-local`

MoneyPrinterTurbo 路径：`integrations\moneyprinterturbo`

## 1. 交接结论

MoneyPrinterTurbo 已从原有的 v1.3.2 后续提交升级到官方稳定版 v1.3.3，并保留本项目已有的素材并行下载和 FFmpeg 编码加速补丁。

本次升级已经通过完整服务测试和主项目门禁，但用户遇到的“任务停在 50%、随后显示 `任务轮询失败 / fetch failed`”尚未从集成层彻底修复。

剩余问题不在 MoneyPrinterTurbo API 是否能启动，而在以下两处：

1. 前端轮询遇到一次网络或服务异常后立即停止。
2. `dy-mpt-*` 任务号与官方任务号的映射只保存在 8787 Node 进程内存中，服务重启后会丢失。

下一阶段应实现“瞬时错误自动恢复、旧任务明确失效、任务映射持久化”，不要继续调整视频时长或 FFmpeg 超时时间来掩盖问题。

## 2. 当前版本与 Git 状态

### 主项目

- 分支：`fix/p0-stability`
- 升级提交：`cbef3fe5bc2655e16411b74a3843f6319f391991`
- 提交说明：`chore: update MoneyPrinterTurbo to v1.3.3`
- 相对 `origin/fix/p0-stability`：领先 1 个提交
- Push：未执行

### MoneyPrinterTurbo

- 官方版本：`v1.3.3`
- 官方提交：`b4218dd66851acf2e19d4aa5f10252b08380f742`
- 官方发布页：https://github.com/harry0703/MoneyPrinterTurbo/releases/tag/v1.3.3
- 子模块指针指向官方可获取的 v1.3.3 提交，没有指向仅本机存在的合并提交。

子模块显示为 dirty 是预期状态，因为本项目会在官方版本上应用以下本地补丁：

- 素材 4 路并行下载。
- `libx264` 默认使用 `veryfast` preset。
- 相关素材顺序回归测试。
- Windows 日志路径分隔符兼容测试。

补丁源文件：

`patches/mpt-speed-download-preset.patch`

应用入口：

`应用MPT补丁.bat`

不要直接提交一个只能在本机找到的 MoneyPrinterTurbo 子模块提交。线上父项目必须继续指向官方 tag/commit，本地差异通过补丁文件保存。

## 3. 已完成的升级内容

v1.3.3 与当前故障相关的官方改进包括：

- 加强任务执行和恢复。
- 保留生成进度、日志和终态。
- 改善中断任务恢复。
- 修复开始生成后 WebUI 空白。
- 增加更清晰的阶段和错误跟踪。
- 扩大任务、API、媒体处理和失败恢复测试覆盖。

这些改进增强了 8080 MoneyPrinterTurbo 本体，但 8787 自有的 `dy-mpt-*` 映射和轮询策略仍需要单独修复。

## 4. 已验证结果

已执行：

```powershell
uv lock --check
uv sync --locked
uv run --locked pytest test/services -q
npm.cmd run check:gate
npm.cmd run test:e2e
```

结果：

- MoneyPrinterTurbo 服务测试：`470 passed, 10 skipped`
- 本地补丁针对性测试：`54 passed`
- 主项目 `check:gate`：通过
- 主项目端到端测试：`19 passed, 0 failed`
- `git diff --check`：通过

曾出现一个官方 v1.3.3 Windows 测试兼容问题：

`test/services/test_webui_task.py` 把路径写死为 `/`，Windows 日志实际使用 `\`。本地补丁已将断言调整为同时接受两种路径分隔符，生产逻辑不受影响。

## 5. 现场故障证据

故障页面曾显示：

- 状态：`任务轮询失败`
- 错误：`fetch failed`
- 页面进度：50%
- 页面任务号：`dy-mpt-1166a273-e6e0-4d63-be07-913871f069c0`

当时现场：

- 8787 主服务在线。
- 8080 MoneyPrinterTurbo API 在线。
- `/api/v1/tasks` 返回成功，但任务列表为空。
- 最近输出目录只生成了 `temp-clip-1.mp4` 至 `temp-clip-9.mp4`。
- 没有生成 `final-1.mp4`。
- 临时素材最后更新时间约为 16:42。
- MoneyPrinterTurbo API 在 16:53 重新启动。

结论：

任务在素材处理阶段尚未完成，随后服务重启。浏览器仍保存旧的 `dy-mpt-*` 任务号，但 Node 和 MoneyPrinterTurbo 已失去对应运行态，轮询请求失败后前端停止刷新，页面因此永久停在旧的 50%。

注意：50% 本身不能证明任务崩溃。历史真实任务曾在 FFmpeg/MoviePy 阶段保持 50% 约 11 分钟后正常生成 `final-1.mp4`。必须结合任务输出、API 状态和错误信息判断。

## 6. 根因代码位置

### 6.1 前端遇到一次错误立即停止

文件：

`ui/modules/money-printer.js`

关键位置：

- `restoreActiveTask()`：约第 127 行。
- `pollTask()`：约第 489 行。
- `stopPolling()`：约第 817 行。

当前 `pollTask()` 的异常处理：

```js
} catch (error) {
  stopPolling();
  setStatus("任务轮询失败", error.message, true);
}
```

任何一次瞬时断连、8080 重启或 8787 请求失败都会停止定时器，没有重试、退避或自动恢复。

浏览器任务号保存在：

```js
localStorage.setItem(ACTIVE_TASK_KEY, taskId);
```

因此页面刷新后可能再次恢复一个服务端已经不认识的任务号。

### 6.2 任务映射只存在内存

文件：

`server/routes/money-printer-routes.js`

关键位置：

- `const managedTasks = new Map()`：约第 27 行。
- `GET /api/money-printer/task`：约第 149 行。
- `createManagedTask()`：约第 408 行。

创建任务时：

```js
const managed = {
  id: `dy-mpt-${randomUUID()}`,
  officialTaskId: "",
  // ...
};
managed.officialTaskId = await submitOfficialTask(status, managed.payload);
managedTasks.set(managed.id, managed);
```

`managedTasks` 没有写入磁盘。8787 重启后，`dy-mpt-* -> officialTaskId` 映射消失。

当映射不存在时，当前 GET 路由会把 `dy-mpt-*` 直接传给官方 `/api/v1/tasks/{id}`。官方 API 不认识这个包装任务号，因此返回失败。

## 7. 建议修复方案

### P0-A：轮询瞬时错误自动恢复

目标：

- 网络错误、连接拒绝、HTTP 5xx 不结束任务。
- 使用指数退避，最大间隔 30 秒。
- 恢复成功后自动回到正常 2.5 秒轮询。
- 页面显示“连接暂时中断，正在第 N 次重试”，而不是直接显示任务失败。

建议状态：

```js
state.pollFailureCount = 0;
state.pollRetryTimer = 0;
```

建议规则：

- 成功请求：失败次数归零。
- 网络错误、408、429、5xx：保留活动任务号并重试。
- 明确 404、`TASK_NOT_FOUND`、`MANAGED_TASK_NOT_FOUND`：停止轮询、清除旧任务号、恢复创建按钮。
- 官方任务返回 `state === -1`：按真实任务失败处理。
- 页面离开或创建新任务时清理 interval 和 retry timeout。

不要同时保留多个定时器。建议统一由单一调度函数安排下一次请求，避免 `setInterval` 与退避 `setTimeout` 重叠。

### P0-B：返回结构化错误码

修改 `server/routes/money-printer-routes.js`：

- 如果任务号以 `dy-mpt-` 开头但 `managedTasks` 中不存在，不要转发给官方 API。
- 返回 HTTP 404：

```json
{
  "ok": false,
  "code": "MANAGED_TASK_NOT_FOUND",
  "message": "任务记录已失效，可能是服务重启导致。"
}
```

前端根据 `code` 决定是否清除 `ACTIVE_TASK_KEY`，不要依赖中文错误文案正则判断。

### P0-C：持久化任务映射

建议存储位置：

`.data/money-printer/managed-tasks.json`

该目录已经由 `workflowDir` 指向，不应提交到 GitHub。

至少保存：

```json
{
  "id": "dy-mpt-...",
  "officialTaskId": "...",
  "payload": {},
  "materialSources": [],
  "sourceIndex": 0,
  "attempts": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

实现要求：

- 通过临时文件加原子 rename 写入，防止进程中断产生半个 JSON。
- 创建任务、切换备用素材源、任务终态时更新。
- 路由初始化时加载。
- 无效 JSON 不能导致 8787 启动失败，应记录警告并使用空映射。
- 清理超过 7 天的任务记录；不要删除 MoneyPrinterTurbo 官方输出目录。
- 不保存 API Key、Cookie、Token。

### P1：启动时恢复和用户操作

页面初始化时：

1. 读取 `ACTIVE_TASK_KEY`。
2. 请求任务状态。
3. 任务存在：继续轮询。
4. 任务明确不存在：清除旧 ID，显示“上次任务因服务重启失效，请重新创建”。
5. API 暂时离线：保留 ID，等待 API 自动启动后重试。

建议增加两个明确操作：

- `重新连接任务`
- `放弃旧任务`

不要让旧任务状态永久禁用“自动匹配素材并预览”。

### P1：细化进度阶段

将 50% 拆成可理解的阶段提示：

- 搜索素材。
- 下载素材 `n/总数`。
- 处理视频片段 `n/总数`。
- FFmpeg 拼接。
- 音频与字幕合成。
- 写出最终视频。

进度细化与轮询恢复应分成两个独立提交，便于回归和回退。

## 8. 回归测试要求

必须先增加能复现故障的测试，再修改生产代码。

建议新增：

`test-money-printer-polling-recovery.mjs`

必须覆盖：

1. 第一次轮询返回 `fetch failed`，任务不会进入终态，之后成功请求可以恢复。
2. 连续瞬时失败时退避不超过 30 秒。
3. `MANAGED_TASK_NOT_FOUND` 会清除旧任务 ID。
4. 普通网络失败不会清除旧任务 ID。
5. 创建新任务会取消旧任务的所有 timer。
6. 8787 路由重建后可以从磁盘恢复 `dy-mpt-* -> officialTaskId`。
7. 损坏的映射文件不会阻止服务器启动。
8. 映射文件不会保存密钥。

保留并继续运行：

- `test-money-printer-production.mjs`
- `test-e2e.mjs`
- MoneyPrinterTurbo `test/services`

不要只增加源代码字符串断言。至少要有一个测试真实驱动轮询状态变化或任务映射保存/加载。

## 9. 手工验收步骤

### 场景一：瞬时断连

1. 从 TTS 页面发送已确认的文案、音频和时间戳字幕。
2. 创建 MoneyPrinterTurbo 任务。
3. 在任务运行中让 8080 短暂不可用。
4. 页面应显示重试状态，不能立即终止轮询。
5. 8080 恢复后进度应继续更新。

### 场景二：8787 重启

1. 创建任务并记录 `dy-mpt-*` 号。
2. 重启 8787。
3. 刷新 MoneyPrinterTurbo 页面。
4. 服务应从持久化映射恢复 official task id。
5. 页面应继续显示同一任务状态。

### 场景三：任务确实不存在

1. 注入不存在的 `dy-mpt-*` 任务号。
2. 服务返回 `MANAGED_TASK_NOT_FOUND`。
3. 页面清除旧任务状态。
4. “自动匹配素材并预览”恢复可用。

### 场景四：真实出片

1. 使用确认后的 TTS 三件套创建一次完整任务。
2. 等待素材下载、FFmpeg 合成完成。
3. 确认生成 `final-1.mp4`。
4. 确认页面预览、下载和从头播放正常。
5. 不得只以进度到达 100% 作为成功标准。

## 10. 验证命令

```powershell
node --check ui/modules/money-printer.js
node --check server/routes/money-printer-routes.js
node test-money-printer-polling-recovery.mjs
node test-money-printer-production.mjs
npm.cmd run check:gate
npm.cmd run test:e2e
```

如修改 MoneyPrinterTurbo 子模块代码，还要运行：

```powershell
cd integrations\moneyprinterturbo
uv lock --check
uv run --locked pytest test/services -q
```

最后执行：

```powershell
git diff --check
git status --short --branch
git -C integrations/moneyprinterturbo status --short --branch
```

只暂存本次修复文件。禁止使用 `git add -A`，不得混入当前工作区已有的图片素材功能修改。

## 11. 预计修复时间

### 最小可用修复

- 轮询退避和自动恢复：1–1.5 小时
- 结构化任务不存在错误和旧 ID 清理：0.5–1 小时
- 针对性回归测试：0.5–1 小时

合计：约 2–3.5 小时。

### 完整修复

- 上述最小修复：2–3.5 小时
- 任务映射持久化、加载、清理和异常保护：2–3 小时
- 完整门禁和真实视频生成验收：1–2 小时

合计：约 5–8.5 小时，建议按 1 个工作日安排。

如果还要增加完整的分阶段进度上报，额外预留 2–4 小时。

## 12. 当前注意事项

- 截至本交接快照，8080 Python 进程是在升级前启动的。需要重启主程序或 MoneyPrinterTurbo API，才能让运行进程加载 v1.3.3。
- 不要强制结束不确定归属的 Python 进程；先核对命令行和项目路径。
- 主工作区仍有图片素材功能的未提交改动，均属于已有工作，不能覆盖、还原、暂存或混入本修复。
- 当前升级提交尚未 Push。需要上传时，只推送经过明确核对的提交和补丁文件。
- 真实视频任务在 FFmpeg 阶段可能持续数分钟。诊断时必须同时查看 API、任务目录和最终输出，不能把 50% 平台期直接判定为崩溃。

## 13. 完成定义

只有同时满足以下条件，才能宣布修复完成：

- 单次或短时网络错误不会永久停止轮询。
- 8787 重启后可以恢复活动任务映射，或明确、安全地结束失效任务。
- 任务不存在时页面能恢复创建新任务。
- 旧任务不会无限保留 50% 假进度。
- 真实任务能够输出并预览 `final-1.mp4`。
- 新增回归测试通过。
- `npm.cmd run check:gate` 通过。
- `npm.cmd run test:e2e` 通过。
- MoneyPrinterTurbo 服务测试通过。
- `git diff --check` 通过。
- 未混入工作区其他未提交功能。
