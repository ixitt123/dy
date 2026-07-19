# douyin-mcp-local 全面代码审查报告

- 审查日期：2026-07-19
- 审查分支：`fix/p0-stability`
- 项目：`douyin-mcp-local`
- 审查性质：静态代码审查、依赖审计、现有测试验证；本报告不包含修复代码
- 第三方边界：`integrations/moneyprinterturbo` 作为 Git 子模块，仅审查本项目对它的集成层，不把第三方源码计入本项目质量统计

## 一、结论摘要

当前项目的核心生产线可以运行，现有测试闸门全部通过，但代码已经进入“功能很多、共享边界不够清晰、修改容易产生连锁回归”的阶段。最需要优先处理的不是继续增加兜底 `catch`，而是先收紧本地 HTTP 服务的信任边界、消除可直接利用的输入风险，并统一配置与状态持久化。

本次确认：

- 162 个 JavaScript 文件通过语法检查，`npm run check:gate` 全部通过。
- 未发现已确认的 SQL 注入；SQLite 查询主要使用预编译参数，动态列名经过常量白名单。
- 未发现已确认的长期堆内存泄漏；多个任务 Map 已有超时清理，队列历史也有限长。
- 确认存在 6 类高优先级问题：本地 API 缺少身份/来源校验、设置与任意本地图片文件可被读取、静态文件目录校验可绕过、MoneyPrinter 打开链接存在命令注入面、网页分析存在 SSRF 与无上限读取、图片素材页面存在存储型 DOM XSS。
- 生产依赖审计返回 8 项已知漏洞：4 高危、4 中危。
- 最大的维护风险是 `ui-server.mjs`、`legacy-runtime.js` 和 `app.css` 继续膨胀，以及新旧模块并行维护导致同一业务规则出现多个实现。

## 二、审查范围与规模

仓库约有 727 个本项目跟踪文件（不含子模块内容），其中 JavaScript/ESM 文件 162 个。主要热点文件：

| 文件 | 约行数 | 主要风险 |
| --- | ---: | --- |
| `ui-server.mjs` | 9,257 | HTTP、WebSocket、配置、文件、TTS、分析、任务等职责集中 |
| `ui/modules/legacy-runtime.js` | 8,369 | 旧运行时仍承载大量业务逻辑，与新模块并存 |
| `ui/app.css` | 10,891 | 全局样式耦合、回归面大 |
| `server/routes/ian-xiaohei-routes.js` | 3,831 | 单一路由模块过大 |
| `ui/workbench.js` | 2,482 | DOM 拼接、全局事件与多业务状态混合 |
| `task-store.mjs` | 2,115 | 多领域数据表和迁移逻辑集中 |

`ui-server.mjs` 内约有 41 个导入、228 个函数声明、156 个路由条件、135 次同步文件系统调用和 15 处子进程调用。这是当前最主要的修改冲突与回归源。

## 三、高优先级改进项

### H1. 本地 API 没有身份、Host、Origin/CSRF 边界

**证据**

- 服务虽然只监听 `127.0.0.1`（`ui-server.mjs:9129`），但主请求入口 `ui-server.mjs:7028` 和 WebSocket 升级入口 `ui-server.mjs:9105-9111` 没有校验 `Host`、`Origin` 或启动令牌。
- `/api/settings/all` 在 `ui-server.mjs:8914-8916` 直接返回完整 `readSettings()`。正常前端没有使用该端点，只有 E2E 测试引用它。
- `/api/image/file` 在 `ui-server.mjs:9060-9069` 接收任意绝对路径并整文件读取；`/api/image/thumbnail` 也直接信任路径（`ui-server.mjs:9073-9079`）。

**影响**

仅绑定回环地址并不能构成完整防护。本机恶意进程可以直接调用；浏览器 DNS rebinding 场景下，恶意网页也可能把请求送到本地服务并读取响应。组合后可导致 API 密钥泄露、任意本地图片/文件内容读取和状态修改。

**具体修改建议**

1. 每次启动生成随机会话令牌，页面首开时注入，所有 `/api/*` 和 `/ws/progress` 必须校验。
2. 严格允许 `Host` 为实际端口上的 `127.0.0.1`/`localhost`，拒绝其他 Host；WebSocket 同时校验 `Origin`。
3. 删除 `/api/settings/all`；如确有调试需要，只返回经过明确白名单和脱敏的公开投影。
4. 图片接口不再接收任意 `path`，改接收数据库资产 ID；服务端查询受管理路径，并用统一的 `path.relative` 校验限定在 `image-assets`、`downloads` 等允许根目录。
5. 对写操作要求 `Content-Type: application/json`，并增加 CSRF/来源校验。
6. 新增 Host、Origin、无令牌、越权资产 ID、WebSocket 非法来源的自动化测试。

**理由**：这是多个高危问题的共同根因，先修这一层可以同时降低秘密泄露、文件读取、XSS 后续利用和恶意任务触发风险。

### H2. 静态文件目录校验可被 Windows 路径绕过

**证据**

`serveStatic()` 使用字符串前缀判断：`requested.startsWith(uiDir)`（`ui-server.mjs:6984-6993`）。实际验证：请求 `/..%5cui-server.mjs` 或 `/..%2fui-server.mjs` 后，Windows 会解析到项目根的 `ui-server.mjs`，而 `C:\...\ui-server.mjs` 仍以字符串 `C:\...\ui` 开头，因此检查错误地返回通过。

**影响**

可读取 `ui` 同前缀的项目文件，已确认至少能泄露 `ui-server.mjs` 源码。它不是任意全盘穿越，但会暴露服务实现并辅助其他攻击。

**具体修改建议**

使用统一函数：

```js
const relative = path.relative(uiDir, requested);
const inside = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
```

同时拒绝 URL 路径中的反斜杠、NUL、解码失败和重复解码结果；增加 `%5c`、`%2f`、混合分隔符、双重编码的回归测试。

**理由**：这是已通过本机路径计算复现的确定性漏洞，不是理论风险。

### H3. MoneyPrinter “打开目标”存在 Windows 命令注入面

**证据**

- POST `/api/money-printer/open` 把请求体交给 `openTarget()`（`server/routes/money-printer-routes.js:178-190`）。
- `task-video` 只用 `startsWith("http")` 判断 URL（`server/routes/money-printer-routes.js:675-681`）。
- Windows 使用 `spawn("cmd", ["/c", "start", "", target])`（`server/routes/money-printer-routes.js:685-688`），用户内容会进入命令解释器。

**影响**

带有 `&`、`|`、引号等元字符的目标可能被 `cmd /c` 二次解释，形成命令执行风险；H1 又使该接口缺少调用者身份边界。

**具体修改建议**

1. 用 `new URL()` 解析并仅允许精确的 `http:`/`https:`，拒绝用户名密码、控制字符和异常长度。
2. 不经过 `cmd.exe`。Windows 可使用 `explorer.exe <url>` 或明确的系统 URL 打开 API，并始终使用直接参数数组、`shell: false`。
3. 对固定目录目标使用服务端枚举 ID，不接受客户端任意路径。
4. 添加含 `& calc`、引号、换行、`file:`、`javascript:` 的负向测试。

**理由**：子进程边界一旦被绕过，影响远大于普通功能错误。

### H4. 网页分析存在 SSRF 和无上限响应读取

**证据**

- `/api/analyze` 直接把请求中的 URL 传给分析引擎（`ui-server.mjs:8845-8853`）。
- `WebpageAdapter` 只判断 `http/https`，允许自动跟随重定向，然后执行 `await response.text()`（`server/core/adapters/webpage-adapter.js:25-48`）。没有私网地址阻断、响应类型限制或下载字节上限。

**影响**

可以探测或读取回环、局域网、链路本地及云元数据地址；超大响应会整块进入内存，阻塞事件循环甚至使进程内存耗尽。

**具体修改建议**

建立唯一的 `safeFetchUrl()`：解析 DNS 并在每次重定向前后拒绝 loopback/private/link-local/metadata IP；限制重定向次数；只接收 HTML/XML 文本类型；流式读取并设置例如 5 MB 硬上限；保留现有超时并增加连接/读取阶段错误分类。

**理由**：安全与性能风险来自同一个读取入口，应该在通用网络边界一次解决。

### H5. 图片素材页面存在存储型 DOM XSS

**证据**

- `ui/workbench.js:1968-1993` 把提示词拼入 `innerHTML` 和内联 `onclick`。所谓 `safePrompt` 只转义反斜杠和单引号，未处理双引号、尖括号和属性上下文。
- 已保存素材的提示词在 `ui/workbench.js:2029` 直接插入 HTML，又在 `ui/workbench.js:2034` 进入内联事件；错误消息也在 `ui/workbench.js:2044` 未转义插入。
- 前端多个模块共有大量 `innerHTML` 写入，转义函数至少有多份独立实现。

**影响**

恶意或模型生成的提示词保存后，在素材列表打开时可执行脚本。结合无认证本地 API，可读取页面可访问的数据并触发本地操作。

**具体修改建议**

1. 数据文本统一使用 `textContent`；卡片使用 DOM API/模板节点创建。
2. 移除 HTML 字符串中的 `onclick`，改用 `addEventListener` 和不透明 `assetId`。
3. 必须渲染富文本时只走单一、经过测试的 sanitizer，并逐步启用 CSP/Trusted Types。
4. 增加提示词、标题、错误消息、文件名的 XSS 用例，例如双引号闭合属性和 `<img onerror>`。

**理由**：这不是单纯转义遗漏，而是“数据 + HTML + 内联脚本”混合架构问题，局部补一个字符仍会反复出现。

### H6. 配置持久化非原子，解析失败会静默回退并可能覆盖真实配置

**证据**

- `readSettings()` 捕获所有异常后直接返回默认设置（`ui-server.mjs:494-499`）。
- `writeSettings()` 直接覆盖 `settings.json`（`ui-server.mjs:502-504`），没有临时文件、原子替换、备份或并发锁。
- 另有一套 `server/core/settings-center.js:6-16` 重复读写逻辑；`ui-server.mjs:308` 创建了实例，但当前没有实际调用，形成两个潜在配置真相源。

**影响**

断电、进程终止或并发保存可能产生半个 JSON。下次读取会静默当成空配置，随后任一保存动作可能用默认值覆盖原 API 密钥和选项。这与“前一天正常、第二天部分功能失效”的症状高度吻合。

**具体修改建议**

1. 只保留一个 `SettingsRepository`，所有设置读写经过同一入口。
2. 写入同目录临时文件，flush/fsync 后原子 rename；保留最近 3 个带时间戳备份。
3. 用 schema 校验和单进程写锁；已有文件解析失败时禁止保存，并在 UI 明确提示“配置损坏，可从备份恢复”，不能静默采用默认值。
4. 启动时检测并自动提供备份恢复，但恢复前保留损坏原件。
5. 保持 `settings.json` 不入库；本次确认 `.gitignore` 已忽略，现有秘密安全测试通过。

**理由**：这是功能“随机复发”最可能的基础设施原因之一，修复收益覆盖所有依赖配置的模块。

### H7. 生产依赖含 4 高危、4 中危已知漏洞

**证据**

`pnpm audit --prod` 检查 196 个生产依赖，报告：

- `xlsx@0.18.5`：原型污染、ReDoS 两项高危。当前代码只用于导出，没有发现读取任意 XLSX，因此现有可利用面较低，但该 npm 包版本已长期停更。
- `form-data@4.0.5`：CRLF/ multipart 字段注入，高危，经 `@yc-w-cn/douyin-mcp-server -> axios` 引入，可升级到 `4.0.6+`。
- `hono@4.12.23`：1 项高危、4 项中危，经 `@modelcontextprotocol/sdk` 引入；当前项目不是 AWS Lambda 部署，部分条目与现运行路径不匹配，但 Windows 静态路径和 CORS 类问题值得升级处理。

**具体修改建议**

1. 优先升级 `@yc-w-cn/douyin-mcp-server`/其 MCP SDK 依赖，或使用 pnpm override 把 `form-data` 提升至 `4.0.6+`、`hono` 提升至 `4.12.25+`，升级后跑完整闸门和 MCP 启动测试。
2. 将 `xlsx` 替换为仍维护的导出库，或在评估来源、锁文件和许可证后使用官方已修复发行版 `0.20.2+`；不要仅执行 `npm audit fix --force`。
3. CI 增加生产依赖审计：高危直接阻止合并，中危生成明确待办；允许基于“当前代码路径不可达”的书面豁免，但必须有到期日。

**理由**：依赖漏洞会绕开项目自身代码审查；盲目自动升级又可能破坏生产线，因此应采用定向升级与回归测试。

## 四、中优先级改进项

### M1. `ui-server.mjs` 是过大的组合根和路由单体

**问题**：一个文件同时负责静态资源、HTTP 路由、WebSocket、配置、任务、下载、文案、TTS、ASR、文件对话框和多条生产线。虽然 CS1、小黑、MoneyPrinter、动态大字视频已有部分独立路由，但主体仍是 150 多个 `if (url.pathname...)` 分支。

**建议**：保留 `ui-server.mjs` 只做依赖组装和生命周期；按 `settings`、`tasks`、`downloads`、`analysis`、`tts`、`image`、`moments`、各生产线拆 controller；引入轻量路由表和统一的参数校验/错误中间件。每次只迁移一个域，先写合同测试再移动，避免大重构。

**理由**：降低修复一个模块却破坏其他模块的概率，也是后续安全校验能统一落地的前提。

### M2. 新旧前端运行时并存，业务所有权不清

**问题**：`legacy-runtime.js` 仍有 8,000 多行，`workbench.js` 与多个新模块又重复读取任务、渲染状态和处理素材。相同状态存在中文/英文两套值，例如 `ui/workbench.js:97,1037,1156` 同时兼容“失败”、`failed`、`error`。

**建议**：建立“功能—唯一模块—唯一 API—唯一状态枚举”清单；内部状态固定为英文枚举，中文只在 UI 翻译；使用绞杀式迁移，每完成一个功能的合同测试和新模块接管后再删除对应 legacy 代码。

**理由**：双实现是“修 A 坏 B”和已修逻辑被旧路径覆盖的主要来源。

### M3. 同步 I/O 和同步子进程会阻塞整个服务

**问题**：`ui-server.mjs` 内约 135 次同步文件调用；图片接口整文件 `readFileSync`；TTS 使用同步 ffprobe（`server/tts/tts-service.js:757`），CS1 使用同步 ffmpeg（`server/routes/cs1-video-routes.js:488`）。SQLite 也使用 `DatabaseSync`。

**建议**：请求热路径改 `fs.promises` 或 `createReadStream`；FFmpeg/FFprobe 改异步 `spawn` 并带超时/取消；大型媒体和 CPU 工作放入有并发上限的 worker/子进程。SQLite 暂可保留同步 API，但把长事务和全表统计移出高频请求，并记录事件循环延迟。

**理由**：任何一个大文件或长媒体命令都会让所有页面“卡住”，与用户观察到的 82%/88% 停顿相符。

### M4. WebSocket 生命周期、背压和错误处理不完整

**问题**：`ui-server.mjs:9105-9111` 只监听 `close`，没有 `error`、心跳、`readyState` 和 `bufferedAmount` 保护。

**建议**：增加 `error` 清理、ping/pong 心跳、超时终止；发送前检查 OPEN；超过背压阈值时丢弃可重建的进度事件或断开慢客户端。与 H1 一起校验令牌和 Origin。

**理由**：页面频繁刷新、断开或休眠时可留下不健康连接并放大内存/稳定性问题。

### M5. 多个 JSON 状态文件直接覆盖，错误被吞掉

**证据**：`PipelineState` 读写异常均为空 `catch`，并直接 `writeFileSync`（`server/core/pipeline-bus/PipelineState.js:25-40`）；动态大字、声音资产、导演/VFO 等也存在独立 JSON 写入实现。

**建议**：抽取 `atomicWriteJson()`、`readJsonWithBackup()` 和统一错误日志；状态保存失败应标记任务为“保存失败”而不是假装成功。临时文件必须与目标同盘以保证 rename 原子性。

**理由**：这类问题不会总是立即报错，却会在第二次启动时表现为记录丢失或功能失效。

### M6. 队列的 `cancelAll()` 名称与真实行为不一致

**证据**：`QueueManager.cancelAll()` 只拒绝等待任务（`server/core/queue-manager.js:69-73`），运行任务仍继续；`task-center.close()` 随后马上关闭数据库（`server/core/task-center.js:81-84`）。运行任务稍后更新数据库时可能失败。

**建议**：每个运行任务传入 `AbortSignal`；关闭流程先停止接收、取消等待、通知运行任务、等待有界时间，再关闭数据库。若暂不支持运行中取消，将方法改名 `cancelWaiting()`。

**理由**：修正关机/页面生命周期边界，避免偶发未处理异常和半成品状态。

### M7. 500 错误直接返回内部消息，缺少统一错误模型

**证据**：主请求捕获器把 `error.message` 原样发给客户端（`ui-server.mjs:9097-9101`），各路由又有不同格式的 `message`、`error`、状态码。

**建议**：统一 `{ok:false, code, message, requestId}`；服务端记录完整堆栈但对 API 密钥、路径和上游正文脱敏；客户端只展示可行动的中文提示。参数错误、上游失败、超时、取消、内部错误分别使用稳定错误码。

**理由**：既减少内部路径/供应商信息泄露，也让前端不再靠解析文本判断错误。

### M8. 数据文件与日志缺少明确保留策略

**证据**：`.data` 中 `project-center.sqlite-wal` 约 4.9 MB、`tasks.sqlite-wal` 约 4.2 MB、`image-studio.sqlite-wal` 约 4.1 MB，`sync.log` 约 662 KB；任务表未见统一清理/归档策略。

**建议**：为任务、进度、临时媒体和日志制定可配置保留期；定时 WAL checkpoint、清理已完成的旧任务、压缩/轮转日志；清理前保留用户项目和最终成品，UI 提供“预计释放空间”与确认。

**理由**：当前不是内存泄漏，但长期运行会产生磁盘增长和查询变慢。

## 五、低优先级改进项

### L1. 命名与边界字段不统一

存在 `aliyun_bailian`/`ali-bailian`、`fish_audio`/`fish-audio`、`modelMap`/`modelMapping`、`api_key`/`apiKey`、`default_provider`/`defaultProvider` 等多套写法。

**建议**：内部领域模型只保留一套 canonical ID 和 camelCase；数据库/外部 API 的 snake_case 只在 adapter 映射；旧字段通过带版本的迁移兼容并记录弃用日期。

### L2. 通用工具重复

`escapeHtml`、`safeFileName`、`clampNumber`、JSON 读写、路径包含判断在多个模块重复。

**建议**：按运行环境抽取 `server/utils` 与 `ui/utils`，每个工具补边界测试；安全工具必须只有一个实现，避免各模块修复不同步。

### L3. 文件命名风格混杂

`PipelineBus.js`、`PipelineRunner.js`、`PipelineState.js` 与大量 kebab-case 文件并存。

**建议**：新文件统一 kebab-case；旧文件只在自然迁移时改名，避免为了格式制造大范围无功能 diff。

### L4. 网页正文用正则提取 HTML，鲁棒性有限

**建议**：在完成 SSRF/响应上限后，再评估维护良好的 HTML 解析器；对标题、正文、编码和异常页面建立样本测试。不要把解析器升级与安全边界修复混成一次提交。

### L5. 缺少关键安全回归测试

现有 `check:gate` 覆盖生产线功能、下载目录、设置秘密不入库等，但没有覆盖 Host/Origin、静态穿越、任意路径、XSS、SSRF、MoneyPrinter 命令边界和 WebSocket 生命周期。

**建议**：新建独立 `check:security`，稳定后并入 `check:gate`；每个高优先级问题至少有一个失败前测试和修复后回归测试。

## 六、按审查维度汇总

### 1. 代码结构

已有 `server/routes`、`server/core`、`server/tts`、`server/image` 等领域目录，方向正确；但 `ui-server.mjs` 仍承担过多职责，新旧前端双轨，设置和通用工具存在重复真相源。建议采用小步路由迁移和合同测试，不做一次性重写。

### 2. 性能与安全

高风险集中在本地服务信任边界、路径/命令/URL/HTML 四类不可信输入，以及同步大文件/媒体操作。SQL 主要参数化，未确认 SQL 注入。没有确认长期内存泄漏，但 WebSocket 背压、无上限网页响应和整文件读取会造成内存峰值与卡顿。

### 3. 命名规范

单个模块内部通常可读，但跨层 provider ID、设置字段、状态值和文件命名不统一。核心做法是“内部一个标准，边界统一转换”，而不是全仓机械改名。

### 4. 代码质量

最大问题是单体文件、legacy 与新实现并存、通用安全/持久化工具重复。应先抽取安全边界与持久化，再按功能逐域拆分。

### 5. 错误处理

已有不少局部 try/catch 和降级，例如模型路由初始化失败会只停用 AI 路由（`ui-server.mjs:290-302`），这是合理的隔离。但空 catch、配置静默回退、错误格式不一和关闭顺序仍需修复。不要采用“`uncaughtException` 后记录但继续运行”的策略；未知异常后进程状态不再可靠。正确做法是记录脱敏诊断、优雅关闭并由单实例启动器/看门狗自动重启。

## 七、推荐落地顺序

### 第一批：安全止血（预计 1–2 个工作日）

1. H2 静态路径校验与回归测试。
2. H3 移除 `cmd /c`，严格 URL 校验。
3. H1 删除 `/api/settings/all`、限制图片资产路径、加入 Host/Origin/会话令牌。
4. H5 修复已确认的图片素材 XSS 点。
5. 将上述测试加入 `check:gate`。

### 第二批：防止“隔天失效”（预计 1–2 个工作日）

1. H6 单一设置仓库、原子写入、备份恢复、损坏时拒绝覆盖。
2. M5 共享 JSON 原子持久化。
3. M6 正确的队列关闭协议。
4. M7 统一错误模型和请求 ID。

### 第三批：依赖与性能（预计 1–2 个工作日）

1. H4 安全流式网页抓取。
2. H7 定向依赖升级并全量回归。
3. M3 图片流式响应、异步 FFmpeg/FFprobe。
4. M4 WebSocket 心跳和背压。

### 第四批：结构治理（持续小步实施）

1. 为现有 API 建合同测试。
2. 每次迁移一个路由域离开 `ui-server.mjs`。
3. 建立功能唯一所有者，逐步缩减 `legacy-runtime.js`。
4. 统一状态、provider ID 和共享工具。

## 八、验收标准

- 非法 Host、Origin、无令牌请求和非法 WebSocket 升级被拒绝。
- `/api/settings/all` 不再返回秘密；任何文件接口都不能读取管理根目录外文件。
- `%5c`、`%2f` 等路径绕过用例返回 403。
- MoneyPrinter URL 无法触发 shell 元字符解释。
- 网页抓取拒绝私网/回环地址，并在字节上限处中止。
- 模型提示词、错误文本等不可信字符串无法执行 HTML/脚本。
- 配置写入中断后能从备份恢复，且损坏配置不会被默认值覆盖。
- 定向依赖升级后 `pnpm audit --prod` 不含未豁免高危项。
- `npm run check:gate` 持续通过，并增加上述安全回归。
- 关闭服务时等待/取消运行任务后再关闭数据库，无未处理异常。

## 九、本次验证记录

- `npm.cmd run check:gate`：通过，耗时约 115 秒。
- JavaScript 语法：162 个文件全部通过。
- 下载安全、小黑一键图片、MoneyPrinter 单实例与素材回退、朋友圈原文、结构化 JSON、原文约束字幕修复、改写完整性、音乐 ASR 修复、TTS 字幕校正、页面生命周期、ProviderRegistry、流水线失败策略、TTS 对齐、字幕渲染、模型映射、安全同步、设置秘密安全：全部通过。
- `pnpm.cmd audit --prod --json`：4 高危、4 中危、0 严重、0 低危。
- Git 状态：审查开始时工作树干净；报告将作为单独文件提交，未修改业务源码。

## 十、给非技术使用者的操作建议

在上述高优先级问题修复前：

1. 只在可信电脑上运行，不要把 `127.0.0.1` 服务转发到局域网或公网。
2. 不要打开来源不明的网页后同时运行本软件；使用完及时关闭软件后台。
3. 不导入来源不明的提示词、素材包或配置文件。
4. 每次换电脑前先确认 GitHub 已推送；另一台电脑只执行安全的 `git pull --ff-only`。
5. 出现“设置突然恢复默认”时先停止操作，不要马上保存新设置，优先备份现有 `settings.json` 和 `.data`。
