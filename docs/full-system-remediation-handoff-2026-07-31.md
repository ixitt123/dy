# 短视频生产工作台全量源码审计与彻底修复交接

审计日期：2026-07-31
项目：`douyin-mcp-local`
本地路径：`C:\Users\Admin\Desktop\短视频\douyin-video-tool-source-code\douyin-mcp-local`
审计分支：`fix/p0-stability`
审计提交：`c61dfbe35e13a85bad866313851e8bee07dc4cda`

## 1. 交接结论

这个项目目前不是“某几个按钮偶尔失效”，而是已经进入结构性不稳定阶段：

1. 同一份业务内容同时存在于 SQLite、JSON 文件、内存 `Map`、浏览器 `localStorage` 和 DOM 中，缺少唯一真相源。
2. 前端同时运行旧式全局脚本和新式模块，动态 DOM 又被全局 `MutationObserver` 二次改写，容易出现跨任务串稿、旧值回填和状态互相覆盖。
3. 后端主服务、旧前端运行时和部分生产线路由体积过大，任何局部修改都可能触发远处的共享状态。
4. 当前门禁可以发现语法、若干服务逻辑和部分真实 FFmpeg 渲染错误；HTTP/源码契约测试、浏览器测试和媒体测试已分开命名，任何单项都不能替代完整浏览器行为验证。
5. TTS 四件套在多数页面已经有传递代码，但各生产线没有共享同一份强约束协议和统一媒体验收。MoneyPrinter 的最终二次合成当前明确丢失 BGM。
6. 当前依赖审计仍有 8 个高危、17 个中危、1 个低危告警，不能把安全修复视为已经收尾。
7. `main` 落后当前修复分支 56 个提交。当前实际运行版本、远程修复分支和正式分支并不是同一个发布基线。

彻底修复不能继续采用“用户报一个现象，就在大文件里加一个判断或提示”的方式。正确方向是：

- 先建立真实浏览器和真实媒体回归；
- 再修复当前已确认的 P0 数据串写、BGM 丢失和任务恢复问题；
- 然后统一状态、任务和交接协议；
- 最后拆分超大文件并收紧安全、依赖和发布流程。

本文件是修复施工交接，不代表下面列出的缺口已经修完。只有满足第 16 节“完成定义”后，某项才可以标记为完成。

## 2. 本次审计范围、方法和限制

### 2.1 已审计范围

- Windows 隐藏启动链；
- 主 HTTP / WebSocket 服务；
- 静态资源和本地 API 信任边界；
- 任务、项目、图片、TTS、导演、素材、时间线等存储；
- 文案采集、转写、改写、朋友圈文案、TTS 与 BGM；
- CS1、小黑、MoneyPrinterTurbo、动态大字四条生产线；
- FFmpeg / FFprobe 媒体合成路径；
- 浏览器草稿、偏好和生产线交接状态；
- 自动同步、Git 分支、子模块和 CI 门禁；
- 根目录测试与依赖安全告警。

### 2.2 本次使用的证据

- 当前工作树和 Git 历史；
- 当前分支与子模块状态；
- 受版本控制的源码清单和文件规模；
- 当前 SQLite 表结构与记录数量；
- 现有 `.data` 运行产物的类型和规模；
- 当前门禁和 `test:http-contract` 的真实运行结果；
- 当前 `pnpm audit --prod --json` 结果；
- 已有审计、P0 交接和 MoneyPrinterTurbo 交接文档；
- 用户最近实际页面截图和问题链。

### 2.3 本次没有做的事情

- 没有修改任何业务代码；
- 没有清理历史任务、音频、视频、浏览器草稿或数据库；
- 没有把当前分支合并到 `main`；
- 没有提交或推送本交接文档；
- 没有重新生成四条生产线的全套真实成片；
- 没有把依赖升级到修复版本。

因此：

- “当前门禁通过”不等于“所有用户问题已经修复”；
- “源码中存在 BGM 字段”不等于“预览和最终 MP4 中能听到 BGM”；
- “历史文档写着已验证”不等于当前提交仍满足同一结果。

## 3. 当前仓库快照

| 项目 | 当前状态 | 风险 |
|---|---|---|
| 当前分支 | `fix/p0-stability` | 正式分支不是当前运行基线 |
| 当前提交 | `c61dfbe` | 上一轮仅修了跨任务异步响应，未修复浏览器草稿覆盖 |
| 上游 | `origin/fix/p0-stability` | 本地与同名远程分支一致 |
| `main` | `a7f6b2f` | 比当前分支落后 56 个提交 |
| 主仓库工作树 | 审计开始时干净 | 新增本文后应只出现本文 |
| MoneyPrinterTurbo 子模块 | `d994b15`，`v1.3.3-1-gd994b15` | 当前是项目自有 `vendor/moneyprinterturbo` 线，不是直接跟随官方 tag |
| 子模块工作树 | 干净 | 后续改动仍须单独验证与提交 |
| 可执行/配置源文件 | 237 个 | 不是一个可靠人工通读保证回归的小项目 |
| 根目录测试文件 | 46 个 | 其中约 32 个含源码字符串/正则断言 |
| 主服务 | `ui-server.mjs`，9983 行 | 单文件承担 132 个直接路由和大量业务 |
| 旧前端运行时 | `ui/modules/legacy-runtime.js`，9705 行 | 全局状态、DOM 和业务混在一起 |
| 小黑服务路由 | `server/routes/ian-xiaohei-routes.js`，3997 行 | 页面、生成、音乐、音频分析、视频合成职责过多 |
| 动态大字服务 | `server/kinetic-text/kinetic-text-service.js`，2165 行 | 项目状态、字幕、预览、导出、FFmpeg 混合 |
| TTS 服务 | `server/tts/tts-service.js`，2104 行 | 生成、字幕、校准、文件写入、恢复耦合 |
| CS1 路由 | 1828 行 | 模板生成、BGM、Hyperframes 和 FFmpeg 混合 |
| MoneyPrinter 路由 | 1162 行 | 服务管理、任务代理、素材降级、最终合成混合 |
| 前端样式 | `ui/app.css`，11583 行 | 页面样式边界不清晰 |

Git 历史还显示：

- `legacy-runtime.js` 被 228 个提交修改过；
- `ui-server.mjs` 被 254 个提交修改过；
- 2026-07-01 以来仓库有 1028 个提交；
- 历史中存在大量按分钟生成的“自动同步”提交。

这类高频、小范围、缺少真实行为回归的修改方式，是“原来好的功能后面又坏”的重要原因。

## 4. 当前系统架构

### 4.1 启动链

```text
start-ui-hidden.vbs
  -> 查找 node.exe
  -> launch-ui.mjs
     -> 读取 ui-server.url
     -> 已有服务可用：打开已有地址
     -> 否则启动 ui-server.mjs --open --no-auto-close
        -> 初始化设置、SQLite、TTS、图片、四条生产线
        -> 监听本地 HTTP / WebSocket
        -> 浏览器加载 ui/index.html
```

关键文件：

- `start-ui-hidden.vbs`
- `launch-ui.mjs`
- `ui-server.mjs`
- `server/core/runtime-process.js`
- `server/core/page-lifecycle.js`

当前正面能力：

- 有单实例 PID 锁；
- 启动器会复用已有服务；
- 本地 API 已有随机会话 Cookie、Host / Origin 校验；
- 页面刷新与真正关闭有生命周期区分。

当前风险：

- 启动时 `taskStore.resetActiveTasks()` 会把下载/转写中的任务重新排队，但并非所有其他任务系统都有同等恢复能力；
- 下载任务、临时转写任务、MoneyPrinter 包装任务和最终文件 URL 仍有内存态；
- `--no-auto-close` 让服务长期存在，也放大了陈旧内存状态和浏览器旧缓存的影响。

### 4.2 后端组成

`ui-server.mjs` 既是组合根，又仍承担大量业务：

- 设置读取、规范化和保存；
- 文件选择和资源读取；
- 采集、下载、转写和改写；
- 朋友圈生成和发布；
- TTS 路由；
- 项目和工作流路由；
- 图片路由；
- 静态文件和 WebSocket；
- 四条生产线路由的装配。

已抽出的主要服务：

- `server/tts/`
- `server/image/`
- `server/voices/`
- `server/director/`
- `server/vfo/`
- `server/kinetic-text/`
- `server/core/model-router/`
- `server/core/pipeline-bus/`
- `server/core/adapters/`
- `server/routes/`

问题不在于“完全没有模块化”，而在于抽出的模块和旧主文件同时拥有业务职责，形成双重入口。

### 4.3 前端组成

页面同时加载：

1. `tts-handoff-store.js`
2. `moments-image-instruction.js`
3. `legacy-runtime.js`
4. `workbench.js`
5. `tts-voice-clone.js`
6. ES Module 入口 `app.js`

`app.js` 表面上初始化模块，但 `rewrite.js`、`tts.js`、`settings.js` 等文件目前只有几行标记逻辑，真实业务仍主要在 `legacy-runtime.js`。与此同时，CS1、MoneyPrinter、动态大字、小黑嵌入页又有较完整的新模块。

这会导致：

- 新模块看似是所有者，旧脚本仍在实际监听；
- 同一个按钮或 DOM 区域可能由多个初始化阶段处理；
- 页面切换、动态重绘和恢复逻辑的先后顺序影响最终状态；
- 测试容易只验证“函数名存在”，不能证明实际执行的是哪条路径。

## 5. 当前数据与状态真相源

### 5.1 SQLite

当前本机数据库快照：

| 数据库 | 主要表/记录 | 角色 |
|---|---|---|
| `.data/tasks.sqlite` | tasks 20、tts_jobs 23、voices 96、director_projects 53、timeline_projects 9 等 | 老任务、TTS、导演、时间线等主业务 |
| `.data/project-center.sqlite` | projects 9、project_assets 130 | 新项目中心 |
| `.data/task-center.sqlite` | tasks 0 | 新任务中心，当前没有成为主任务真相源 |
| `.data/content_analysis.sqlite` | content_analysis 0 | 内容分析存储，当前基本未使用 |
| `.data/image-studio.sqlite` | image_jobs 149、image_assets 308 | 图片生成和资产 |

### 5.2 JSON 与文件系统

- `.data/pipeline-states.json`
- `.data/kinetic-text/projects/*/project.json`
- `.data/money-printer/`
- `.data/cs1-video-maker/`
- `.data/xiaohei-video-maker/`
- `.data/tts/`
- `rewrites/`
- `downloads/`
- `settings.json`
- `reference_examples.json`
- `personas/moments-personas.json`

### 5.3 浏览器本地状态

- 页面选择和输入草稿；
- 当前项目 ID；
- TTS 向四条生产线的交接包；
- MoneyPrinter 当前任务 ID；
- 动态大字当前任务、偏好和收藏；
- 小黑项目 ID、提示词计划缓存和合成设置；
- 朋友圈生成进度和草稿；
- 页面路由。

### 5.4 内存状态

- 下载与转写临时任务；
- 批量任务控制器；
- WebSocket 客户端；
- 桌面图片临时令牌；
- TTS / BGM 前端关联表；
- MoneyPrinter `managedTasks`；
- MoneyPrinter 最终文件 `renderedFiles`；
- 多个服务内部的运行任务和缓存。

### 5.5 应建立的唯一真相规则

| 数据 | 唯一真相源 | 浏览器允许保存 | 禁止 |
|---|---|---|---|
| 原始文案/改写成品 | SQLite 版本记录 | 当前编辑中的显式草稿 ID | 按 DOM 序号保存服务端成品 |
| TTS 音频/字幕/BGM | 资产表 + 文件清单 | 最近查看 ID、播放器偏好 | 整个四件套只放 localStorage |
| 生产线交接 | SQLite `handoffs` 表 | 未确认 UI 选择 | 只靠页面事件和本地存储 |
| 生产任务 | SQLite `jobs` 表 | 当前查看 ID | 任务映射只放 `Map` |
| 视频成片 | 资产表 + 实际文件 | 最近查看 ID | 仅用 100% 或内存 URL 表示完成 |
| 设置 | 单一设置服务 + 原子写 | 非敏感显示偏好 | 两套读写器同时写 `settings.json` |

## 6. 已确认仍存在的 P0 问题

### P0-01：改写成品会被旧任务浏览器草稿覆盖

这是当前“串稿”问题的真实根因，不是模型生成错，也不是 SQLite 保存错。

证据链：

1. `UI_DRAFT_SELECTOR` 包含所有 `textarea`：`ui/modules/legacy-runtime.js:32-46`。
2. 草稿键只识别 `field/provider/task/target/draftKey`，不识别改写卡片已有的 `data-version-key`：`ui/modules/legacy-runtime.js:95-104`。
3. 动态改写成品框只有 `data-version-key`：`ui/modules/legacy-runtime.js:1303`、`1370`。
4. 不同任务的相同第 N 个输出框因此共用同一个 localStorage 键。
5. 全局 `MutationObserver` 在 DOM 更新后 80ms 再次恢复所有选择和草稿：`ui/modules/legacy-runtime.js:241-267`。
6. 恢复逻辑直接执行 `control.value = value` 并触发 `input`：`ui/modules/legacy-runtime.js:115-124`。
7. 新成品先在 `renderRewriteVersions()` 渲染：`ui/modules/legacy-runtime.js:7681`，随后可能被旧草稿覆盖。

为什么上一轮修复没解决：

- `c61dfbe` 防止了任务 A 的晚到网络响应覆盖任务 B；
- 当前问题发生在正确响应已经渲染之后；
- 覆盖者是浏览器旧草稿，不是异步 API 响应。

最低限度修复：

- 对服务端成品卡片添加 `data-no-draft-persist` 和 `data-no-choice-persist`；
- 对改写结果、参考文本、修改建议和动态参数逐项明确“服务端数据”还是“用户显式草稿”；
- 定向清理旧版 `dy.ui.inputDrafts.v1` 中的改写动态键，不得清空用户全部 localStorage；
- 不允许继续依赖 DOM 序号作为任务数据键。

彻底修复：

- 草稿必须使用 `{projectId, taskId, versionId, field}` 组成稳定键；
- 服务端成品不能被自动草稿恢复覆盖；
- 只有用户点击“保存草稿”或开始编辑后才创建显式草稿版本；
- 任务切换必须卸载上一任务的草稿作用域。

真实回归场景：

1. 打开任务 A；
2. 手动把第一个成品改成唯一字符串 `TASK-A-STALE-DRAFT`；
3. 打开任务 B 并生成正确内容；
4. 等待至少 500ms，覆盖 80ms 恢复窗口；
5. 断言任务 B 没有出现 A 的字符串；
6. 刷新页面并重新打开任务 B；
7. 再次断言内容来自任务 B 的 SQLite 版本；
8. 发送到 TTS，断言 TTS 收到任务 B 内容。

### P0-02：MoneyPrinter 最终下载成片丢失 BGM

前端素材任务确实发送了：

- `bgm_type: "custom"`
- `bgm_file`
- `bgm_volume: 0.18`

位置：`ui/modules/money-printer.js:493-521`。

但用户点击最终生成时：

- `renderFinalVideo()` 只发送 `tts`、背景视频、字幕段和设置；
- 没有发送 `includeBgm`、`bgm_path` 或 `bgmVolume`。

位置：`ui/modules/money-printer.js:628-646`。

后端最终合成：

- 只输入背景视频和 TTS 音频；
- 滤镜只有 `[1:a]volume=...`；
- 没有 BGM 输入、淡入淡出、ducking 或 `amix`。

位置：`server/routes/money-printer-routes.js:924-1001`。

因此：

- MoneyPrinterTurbo 前置预览任务可能带 BGM；
- 工作台自己的“最终视频”二次合成会把它替换成仅有 TTS 的音轨；
- UI 仍显示“四件套”不能证明最终 MP4 含 BGM。

修复要求：

- 最终合成请求必须显式带 `includeBgm`、受信任 `bgmPath` 和 `bgmVolume`；
- 服务端验证 BGM 属于允许的 TTS 音频目录或已暂存目录；
- FFmpeg 使用独立 BGM 输入；
- BGM 按旁白时长循环/裁切；
- 默认音量不得抢人声；
- 结尾必须淡出；
- 最终时长服从 TTS 主音轨；
- `manifest.json` 必须记录实际混音参数和输入文件哈希；
- 合成后必须通过 FFprobe 和音频检测，不能只看进程退出码。

### P0-03：MoneyPrinter 任务映射在服务重启后丢失

当前代码仍是：

- `const managedTasks = new Map()`：`server/routes/money-printer-routes.js:27`
- 创建后只执行 `managedTasks.set(...)`：`server/routes/money-printer-routes.js:430-444`
- 素材源降级后只改内存对象：`server/routes/money-printer-routes.js:475-508`

没有当前磁盘加载/保存实现。

影响：

- 8787 重启后，`dy-mpt-*` 与官方任务 ID 的映射丢失；
- 浏览器仍可从 localStorage 恢复旧 `dy-mpt-*`；
- 页面无法可靠区分“服务暂时离线”和“任务记录永久不存在”；
- 用户会看到卡在旧进度、轮询错误或重新生成入口不可用。

当前前端已经改为轮询失败后继续重试，这是正面改进，但它只解决瞬时失败，不能恢复丢失的映射。

修复要求：

- 使用 SQLite 表 `money_printer_jobs`，不要再增加非原子 JSON；
- 保存包装任务 ID、官方任务 ID、素材源、尝试记录、状态、进度和输出；
- 任何创建/切换素材源/终态更新在同一事务中完成；
- 启动时恢复未终态任务；
- 明确错误码：`UPSTREAM_OFFLINE`、`JOB_NOT_FOUND`、`MAPPING_NOT_FOUND`、`JOB_FAILED`；
- 前端只在永久不存在时清除当前任务 ID；
- 真实执行一次“生成中重启 8787”验收。

### P0-04：旧 `test:e2e` 名称与证明能力不一致

旧 `npm.cmd run test:e2e` 会：

- 访问本地 API；
- 拉取 HTML / JS；
- 大量检查源码是否包含某个 ID、函数名或字符串。

它没有：

- 启动真实浏览器上下文；
- 操作页面；
- 等待 `MutationObserver`；
- 验证播放器控件是否可见；
- 点击预览并确认时间推进；
- 刷新后验证 localStorage 隔离；
- 真正下载并检查四条生产线的成片。

`test-page-lifecycle.mjs` 甚至明确断言通用草稿恢复代码存在，却没有测试动态结果按任务隔离。这让有问题的全局恢复机制被门禁保护起来。

处理要求：

- 现有脚本改名为 `test:http-contract` 或 `test:source-contract`；
- 新增真正的 Playwright 浏览器套件；
- CI 和本地发布门禁分别展示：
  - 语法；
  - 单元；
  - HTTP 契约；
  - 浏览器 E2E；
  - 媒体 E2E；
  - 外部服务受控 E2E。

### P0-05：正式发布基线与当前修复线分裂

当前：

- `main` 在 `a7f6b2f`；
- 当前修复线在 `c61dfbe`；
- 两者相差 56 个提交；
- CI 只在 `main` push / PR 和手工触发时运行；
- 当前修复线虽有远程分支，但不等于正式发布。

影响：

- 另一台电脑或自动同步可能从不同分支启动；
- “我这里修好了”和用户实际启动的版本可能不同；
- 历史交接的验证结果可能对应旧提交；
- 没有统一的版本号、构建清单和运行时版本显示。

处理要求：

- 页面状态接口返回 `gitCommit`、`branch`、构建时间和子模块提交；
- 页面设置页显示当前版本；
- 所有真实验收记录绑定提交哈希；
- 通过 PR 将小修复包逐个合并到 `main`；
- 合并后从 `main` 做一次完整干净安装和真实出片；
- 未完成上述步骤前，不得称为正式版本已修复。

## 7. 已确认的 P1 稳定性与安全缺口

### P1-01：设置存在双入口和非原子写

当前同时存在：

- `ui-server.mjs` 的 `readSettings()` / `writeSettings()`；
- `server/core/settings-center.js` 的 `read()` / `write()`。

两者都直接覆盖 `settings.json`，没有：

- 临时文件 + `fsync` + 原子 rename；
- 写锁或版本号；
- schema 迁移；
- 并发修改合并；
- 失败备份和恢复。

修复方向：

- 所有设置读写只能经过一个服务；
- 使用版本化 schema；
- 写入前校验，写入采用原子替换；
- 保留最近 3 份脱敏备份；
- 密钥读取和公共设置输出分离；
- 禁止调用方自行读写 `settings.json`。

### P1-02：任意网页适配器仍有 SSRF 和响应体上限问题

`server/core/adapters/webpage-adapter.js:21-48`：

- 只检查 `http/https`；
- 允许自动跟随重定向；
- 没有阻止 localhost、私网、链路本地和云元数据地址；
- 没有逐跳复验重定向目标；
- 直接 `response.text()` 读取完整响应；
- 只在抽取正文后截取 50000 字，不能限制下载内存。

修复要求：

- URL 规范化后解析；
- DNS 解析并拒绝回环、私网、链路本地、保留地址；
- 禁止用户名密码和混淆地址；
- 手工处理有限次重定向并逐跳验证；
- 只允许 HTML 类型；
- 使用流式读取和字节上限；
- 超时、最大图片数和最大 HTML 大小独立配置；
- 增加 DNS rebinding 和编码混淆测试。

### P1-03：DOM HTML 注入面仍然过大

当前 `ui/` 中约有 196 个 `innerHTML` / `insertAdjacentHTML` / 类似写入命中，核心大文件约 158 个。

这不等于 196 个都是漏洞，但说明：

- 数据进入 HTML 字符串的入口过多；
- 有些位置使用 `escapeHtml`，有些位置依赖调用方；
- 历史 H5“图片资产 DOM XSS”施工在切换到生产线修复后没有形成完整收尾记录；
- 当前没有统一的安全 DOM 构建器或可信类型策略。

修复要求：

- 优先审计文件名、标题、URL、模型错误、外部网页内容和素材元数据；
- 文本一律 `textContent`；
- URL 通过协议与源校验后赋给属性；
- 列表使用 DOM 节点构建；
- 只有固定模板允许使用 HTML 字符串；
- 增加恶意文件名、标题、SVG、错误消息和素材字段的浏览器 XSS 测试；
- 最终启用适合本地应用的 CSP，禁止内联事件处理器。

### P1-04：同步文件 I/O 和静默异常过多

当前核心源码中约有：

- 398 个同步文件系统调用命中；
- 64 个空 `catch {}`；
- 213 个 `Map` / `Set` 构造命中；
- 62 个定时器命中；
- 只有少量 `AbortController`。

典型问题：

- `PipelineState` 非原子同步写 JSON，且读写失败完全静默；
- 动态大字项目 JSON 非原子覆盖；
- 主请求处理过程中多处同步读写和媒体路径检查；
- 空 catch 让“实际没保存”变成“页面看起来继续运行”；
- 任务取消经常只能取消等待队列，不能取消正在运行的子进程。

修复要求：

- 给每个静默 catch 分类：可忽略、需告警、必须失败；
- 状态写入用 SQLite 事务或原子文件；
- 请求路径上的大文件 I/O 改为异步；
- 子进程全部绑定 `AbortSignal`；
- 取消必须传播到 FFmpeg、Python、网络请求和轮询；
- 退出时记录仍在运行的任务，并在下次启动恢复或明确终止。

### P1-05：任务系统并存

当前至少有：

- `tasks.sqlite` 老任务系统；
- `project-center.sqlite` 项目中心；
- `task-center.sqlite` 新任务中心；
- `PipelineState` JSON；
- 各生产线自己的任务/项目文件；
- 前端当前任务 ID；
- MoneyPrinter 官方任务和包装任务。

`task-center.sqlite` 当前记录数为 0，说明“任务中心 2.0”尚未成为真实主通道。

修复方向：

- 建立统一 `jobs` 表；
- 所有异步任务必须有统一状态枚举、进度、阶段、错误码、输入资产、输出资产和日志；
- 生产线只实现执行器，不再各自发明任务状态；
- WebSocket 只发布数据库状态变化，不作为真相源；
- 重启恢复、取消、重试、清理和保留策略统一。

### P1-06：自动同步实现与安全变更规则冲突

`sync-project.mjs` 的上传路径仍使用 `git add -A`。

风险：

- 会把用户未完成的其他改动、素材配置或子模块变化一起暂存；
- 高测试耗时期间文件发生变化时，虽然有 tree 对比保护，仍不适合多人/多任务并行；
- 历史自动同步提交过密，难以回溯哪一项功能引入回归。

修复要求：

- 上传必须接收明确文件清单；
- 不允许默认 `git add -A`；
- 每个修复包一个主题提交；
- 生成物和本地数据永不进入提交；
- 自动监视只提示，不自动提交；
- 正式发布只能通过 PR 和 CI。

### P1-07：生产依赖存在当前安全告警

2026-07-31 实际执行 `pnpm audit --prod --json`：

- high：8
- moderate：17
- low：1
- critical：0

高危模块包括：

- 直接依赖 `xlsx 0.18.5`：Prototype Pollution、ReDoS；
- `axios`；
- `form-data`；
- `fast-uri`；
- `hono`；
- `brace-expansion`。

处理原则：

- `xlsx` 当前主要用于导出，但项目也有导入接口，必须先确认是否读取用户提供的工作簿；
- 不允许直接执行自动强制升级；
- 先做依赖路径和实际可达性分析；
- 对直接依赖、MCP 依赖链、打包工具链分别建升级包；
- 每个升级包跑安装、门禁、MCP 启动、导入/导出和真实页面测试；
- 无法立刻升级时必须加输入限制和明确风险记录，不能静默接受。

### P1-08：字符编码污染被测试字符串固化

部分源码和测试中存在明显 mojibake 字符串。某些测试直接匹配这些乱码，导致：

- 乱码可能被测试当成“正确行为”；
- 文件在不同编辑器、PowerShell 和浏览器之间容易二次转码；
- 用户看到的文案和测试断言可能不一致。

修复要求：

- 仓库统一 UTF-8；
- 增加编码扫描，阻止常见 mojibake 模式和替换字符；
- 测试使用实际中文或 Unicode 转义；
- 修复时逐页截图，不做全仓机械转码；
- 任何转码提交必须单独提交，禁止混入业务修改。

## 8. 历史高风险项的当前状态

| 历史项 | 当前判断 | 证据/后续 |
|---|---|---|
| H1 本地 API 信任边界 | 已有代码和门禁 | 会话 Cookie、Host、Origin、WebSocket、设置全量导出禁用；当前门禁通过 |
| H2 静态路径穿越 | 已有代码和门禁 | `static-path-safety.js`；当前门禁通过 |
| H3 MoneyPrinter 打开目标命令注入 | 已有代码和门禁 | 直接参数、`shell:false`、URL 过滤；当前门禁通过 |
| H4 网页适配器 SSRF | 当前仍存在 | 见 P1-02 |
| H5 图片/素材 DOM XSS | 未完成系统收口 | HTML sink 仍大量存在；需重新做数据流审计 |
| H6 设置非原子和多真相 | 当前仍存在 | 两套设置读写器 |
| H7 依赖漏洞 | 当前仍存在 | 当前审计为 8 high / 17 moderate / 1 low |
| M1 后端巨型文件 | 当前仍存在且增长 | `ui-server.mjs` 9983 行 |
| M2 前端双所有权 | 当前仍存在 | legacy + workbench + module 同时运行 |
| M3 同步 I/O | 当前仍存在 | 398 个同步文件调用命中 |
| M4 WebSocket 生命周期 | 部分改善 | 鉴权和 close 清理已有；仍需心跳、背压和状态重放设计 |
| M5 JSON 非原子状态 | 当前仍存在 | Pipeline、动态大字等 |
| M6 取消只覆盖等待任务 | 当前仍存在 | `QueueManager.cancelAll()` 不取消 running |
| M7 错误模型不统一 | 当前仍存在 | 多数接口只返回中文 message |
| M8 资产保留/清理 | 未统一 | 多个 `.data` 子目录独立增长 |
| M9 模型配置漂移 | 部分改善 | ModelRouter/设置中心已有，但双写仍在 |
| M10 Task Store 重复与状态不一致 | 当前仍存在 | 多数据库、多任务系统 |
| M11 进程错误边界 | 部分改善 | 顶层请求 catch 有；后台 Promise、子进程和静默 catch 仍需统一 |

## 9. TTS 与四件套协议审计

### 9.1 当前资产定义

无 BGM：

1. 音频；
2. 文案；
3. 带时间戳字幕。

有 BGM：

1. 音频；
2. 文案；
3. 带时间戳字幕；
4. 独立 BGM。

当前前端交接包已经包含：

- `audio_path` / `audio_url`
- `script_path`
- `subtitle_path`
- `timestamped_text_path`
- `sentence_timeline`
- `bgm_path` / `bgm_url`
- `bgm_name`
- `bgm_duration`
- `has_bgm`
- `handoff_id`
- `handoff_revision`

### 9.2 当前主要问题

- 真正的持久化载体仍是每条生产线一份 localStorage；
- 服务端没有权威 handoff 记录；
- 页面事件、localStorage 和目标页面恢复可能走不同顺序；
- “已发送”只证明写入/派发动作发生，不证明目标页面已接收，更不证明成片已混音；
- BGM 与 TTS 父任务的关联有前端 `Map` 和后端 metadata 两种查找方式；
- 某些生产线收到 BGM 后还要再发一次 update，交接不是原子的。

### 9.3 目标协议

新增服务端 `handoffs` 和 `handoff_assets`：

```json
{
  "id": "handoff-uuid",
  "revision": 3,
  "sourceJobId": 23,
  "projectId": "project-id",
  "status": "ready",
  "text": {
    "assetId": "asset-script",
    "sha256": "..."
  },
  "narration": {
    "assetId": "asset-tts",
    "duration": 35.2,
    "sha256": "..."
  },
  "timeline": {
    "assetId": "asset-timeline",
    "rowCount": 12,
    "duration": 35.2,
    "sha256": "..."
  },
  "bgm": {
    "enabled": true,
    "assetId": "asset-bgm",
    "duration": 38.7,
    "defaultVolume": 0.18,
    "fadeOutSeconds": 2.5,
    "sha256": "..."
  }
}
```

规则：

- BGM 可选，但 `enabled=true` 时文件必须存在、可探测、可解码；
- 生产线只能通过 handoff ID 拉取，不能相信任意客户端路径；
- 每条生产线保存 receipt：已接收、已暂存、已渲染、已验证；
- 修改字幕或 BGM 音量会产生新 revision；
- 旧 revision 的后台结果不得覆盖新 revision；
- localStorage 只保存最近 handoff ID。

## 10. 四条生产线当前状态与修复要求

### 10.1 CS1

当前代码能力：

- 接收 TTS BGM 路径；
- `includeBgm=true` 时执行 FFmpeg 后混音；
- TTS 音量 1.0、BGM 默认 0.18；
- BGM 淡入、淡出；
- 最终视频使用 `-shortest`。

位置：

- `ui/modules/cs1-video.js`
- `server/routes/cs1-video-routes.js:254-331`
- `server/routes/cs1-video-routes.js:593-610`

剩余风险：

- 当前自动测试主要验证源码和生成流程，不证明用户当前 handoff BGM 真正进入最终 MP4；
- 输出替换使用 `unlinkSync` 后 `renameSync`，失败时存在原成片已删除、临时文件未接管的窗口；
- BGM 音量固定，没有统一响度测量；
- 混音 manifest 对输入哈希和最终媒体检查不足。

修复：

- 使用安全替换：保留原文件直到新文件验证通过；
- 成片后探测音视频流、时长和频段；
- manifest 记录 BGM 输入与参数；
- 建立真实四件套 CS1 媒体测试。

### 10.2 小黑视频

当前代码能力：

- 接收 handoff BGM；
- 有“是否加入 BGM”和音量控制；
- 页面预览使用独立 Audio 元素同步播放；
- 最终渲染接收 `tts_bgm_path`；
- FFmpeg 支持 TTS+BGM、淡出和 `amix`；
- 支持 1.0 / 1.1 / 1.2 / 1.3 倍速。

位置：

- `ui/modules/ian-xiaohei-app.js`
- `server/routes/ian-xiaohei-routes.js:1181-1199`
- `server/xiaohei-video-renderer.js:102-151`

剩余风险：

- iframe handoff、父页 store 和嵌入页 state 三层状态；
- 预览 BGM 是浏览器第二播放器，不等于成片音轨；
- 页面恢复后 BGM 是否自动可用取决于 handoff URL/path 和 state 恢复顺序；
- 倍速会同时影响音频，必须验证字幕/画面/音频结束点一致；
- 用户的一键添加图片曾回归，说明 prompt cache、图片绑定和 iframe 生命周期仍需真实浏览器测试。

修复：

- 小黑页面只接收服务端 handoff ID；
- BGM 选择和音量写入项目记录；
- 预览显示明确的 BGM 播放条和当前混音状态；
- 最终成片必须通过真实音频频段检测；
- 图片一键添加加入浏览器 E2E：选择文件、绑定场景、刷新、预览、最终渲染。

### 10.3 动态大字

当前代码能力：

- 接收 BGM 路径；
- 项目 `audioMix` 支持本地 BGM；
- 页面预览同步第二 Audio；
- 最终 FFmpeg 使用 BGM 输入、淡出和 `amix`；
- 有真实短 MP4 render smoke。

位置：

- `ui/modules/kinetic-text.js:2095-2146`
- `server/kinetic-text/kinetic-text-service.js:1514-1603`
- `server/kinetic-text/kinetic-text-service.js:1865-1921`

剩余风险：

- 新项目创建时服务端先写 `audioMix: none`，前端再发第二次 update 写 BGM；
- 两次请求之间失败或页面离开，会出现“四件套已接收但项目没有 BGM”；
- 重复 handoff revision 的快速返回分支要确认不会漏更新 BGM；
- 预览第二 Audio 与最终 FFmpeg 混音不是同一实现；
- JSON 项目写入非原子。

修复：

- 创建项目时一次性写入 BGM；
- handoff revision 与项目更新同一事务/单请求；
- 重复交接也要比较 BGM asset/revision；
- 项目改存 SQLite 或使用原子 JSON；
- 真实浏览器预览和真实 MP4 都验证。

### 10.4 MoneyPrinterTurbo

当前代码能力：

- 前置 MPT 任务可暂存 TTS BGM 到 MPT `storage/bgm`；
- 可发送 `bgm_type=custom`、`bgm_file`、`bgm_volume`；
- 轮询遇到瞬时错误不会立刻终止；
- 素材 API 有降级顺序；
- 当前子模块是 v1.3.3 后的项目性能提交。

当前确定问题：

- 最终二次合成丢失 BGM；
- 包装任务映射不持久化；
- `renderedFiles` 只在内存，重启后最终视频 URL 失效；
- 前置 MPT 任务和工作台最终渲染是两套媒体链；
- 当前测试没有覆盖“最终下载文件确实有 BGM”。

修复：

- 先完成 P0-02、P0-03；
- 最终文件注册进入统一资产表；
- 不再用内存 ID 作为唯一下载凭据；
- 明确“素材预览视频”和“最终成片”的音轨来源；
- 真实完成必须看到最终 MP4、音轨检测通过、页面可预览和下载。

## 11. 目标架构

```text
Browser UI
  -> API client（统一错误码、requestId、revision）
     -> Application services
        -> Project service
        -> Asset service
        -> Job service
        -> Handoff service
        -> Settings service
           -> SQLite / atomic file store
     -> Production adapters
        -> CS1 adapter
        -> Xiaohei adapter
        -> MoneyPrinter adapter
        -> Kinetic adapter
           -> Media runner（FFmpeg/FFprobe）
           -> Artifact verifier
```

### 11.1 强制不变量

1. 一个业务实体只有一个权威存储。
2. 任何异步结果必须携带 `entityId + revision + requestId`。
3. 旧 revision 不得写入新 revision。
4. localStorage 不得保存服务端成品正文和完整生产交接。
5. “完成”必须有可读取的输出资产。
6. 视频完成必须通过 FFprobe 和媒体规则验证。
7. 有 BGM 的项目，manifest、UI、任务记录和最终成片必须一致。
8. 失败必须有结构化错误码，不依赖中文文案正则。
9. 所有写入要么事务成功，要么不改变原状态。
10. 每个修复包必须可以单独回滚。

### 11.2 建议数据库核心表

- `projects`
- `assets`
- `asset_versions`
- `jobs`
- `job_events`
- `handoffs`
- `handoff_assets`
- `production_receipts`
- `settings_revisions`
- `audit_events`

不要一次性迁移并删除旧表。采用双读校验、单写新表、验证后切换、最后清理旧入口。

## 12. 分阶段修复施工包

### 阶段 0：冻结和可复现基线

目标：避免继续在不确定基线上修。

任务：

1. 当前分支打审计 tag 或记录提交；
2. 备份 `settings.json`、SQLite 和关键 `.data` 项目清单；
3. 只备份元数据，不复制/覆盖用户历史媒体；
4. 页面显示当前 commit / branch / submodule；
5. 建立问题复现编号和输入/输出目录；
6. 禁止自动上传和 `git add -A`。

验收：

- 能从记录恢复到审计提交；
- 备份可打开；
- 原始媒体未被覆盖；
- 每个问题都有固定复现输入。

### 阶段 1：建立真实测试底座

新增：

- Playwright 浏览器测试；
- 真实浏览器持久化 profile 测试；
- FFmpeg 音频频段 fixture；
- MP4 / MP3 artifact verifier；
- 服务重启测试 harness。

测试命名：

- `test:unit`
- `test:http-contract`
- `test:browser-e2e`
- `test:media-e2e`
- `test:external-e2e`
- `check:release`

验收：

- 能先稳定复现当前串稿；
- 能先稳定复现 MoneyPrinter 最终无 BGM；
- 能先稳定复现 8787 重启后 MPT 映射丢失；
- 测试失败信息指向实际行为，不只是缺少源码字符串。

### 阶段 2：修复改写串稿

独立提交建议：

1. 新增失败浏览器测试；
2. 禁止动态服务端结果自动草稿恢复；
3. 迁移/清理旧改写草稿键；
4. 引入任务/版本作用域草稿；
5. 删除 MutationObserver 对该区域的恢复权限。

不得做：

- 不得清空所有 localStorage；
- 不得修改改写 prompt 掩盖问题；
- 不得给 SQLite 错误归因；
- 不得只延长 80ms；
- 不得只加“重新加载”按钮。

### 阶段 3：修复四条生产线 BGM

独立提交建议：

1. 固化 handoff v3 契约和 fixture；
2. MoneyPrinter 最终渲染加入 BGM；
3. 动态大字创建时原子写入 BGM；
4. 四条生产线统一 manifest；
5. 四条真实媒体回归；
6. 四条真实浏览器预览回归。

默认音频规则：

- TTS 是主音轨；
- BGM 默认 UI 音量 18%，允许用户调整；
- BGM 音量参数进入项目和 manifest；
- BGM 应比旁白明显低，最终以实际响度检测为准；
- 结尾淡出 2.0-3.0 秒；
- BGM 可比旁白长约 3-4 秒作为收尾，但最终视频策略必须由产品明确；
- 若视频严格以旁白结束，则 BGM 在旁白结束前完成淡出；
- 若保留 3-4 秒尾音，则画面、字幕和输出时长必须同步延长；
- 不得出现只有后台播放、没有可见播放条的预览状态。

建议自动媒体验收：

- FFprobe 能读取；
- 至少一条视频流和一条音频流；
- 时长误差在约定范围；
- 最终峰值不超过 -1 dBTP；
- 最终综合响度目标建议约 -16 LUFS，允许按平台调整；
- BGM 测试 fixture 使用与旁白不同频段，成片中必须同时检测到两者；
- 无 BGM fixture 不得检测到 BGM 频段；
- 输出文件大于最低阈值且可完整解码。

### 阶段 4：任务和交接持久化

任务：

- 新建统一 jobs / handoffs；
- 迁移 MoneyPrinter 映射；
- 迁移最终文件注册；
- TTS 四件套改为服务端 ID；
- 四条生产线写 receipt；
- 服务重启恢复；
- 统一错误码和重试策略。

验收：

- 8787 重启；
- 浏览器刷新；
- 8080 短暂离线；
- 任意一条生产线页面切换；
- 都不会丢失当前 handoff 或把旧任务写到新任务。

### 阶段 5：设置、安全和依赖

顺序：

1. 统一设置服务和原子写；
2. Webpage SSRF 防护；
3. DOM XSS 数据流修复；
4. 直接依赖升级；
5. MCP 依赖链升级；
6. 编码扫描；
7. 资产保留与清理策略。

每一项单独提交、单独回归，不与 UI 改版混合。

### 阶段 6：拆分超大文件

拆分原则：

- 先用测试锁定行为；
- 按业务所有权迁移；
- 旧入口调用新服务，保持兼容；
- 每次只迁移一个页面或路由族；
- 迁移完成后删除旧监听器；
- 禁止“复制一份代码到新模块”后双轨长期存在。

建议顺序：

1. 改写页面；
2. TTS 页面；
3. 朋友圈页面；
4. 设置页；
5. 采集/任务页；
6. 主服务对应路由；
7. 生产线公共媒体层。

目标：

- `legacy-runtime.js` 不再拥有业务状态；
- `ui-server.mjs` 只做装配和通用 HTTP；
- 单模块有明确测试和依赖；
- 每个页面只有一个初始化入口。

## 13. 必须建立的回归矩阵

### 13.1 改写

- 任务 A/B 快速切换；
- 晚到响应；
- 80ms 草稿恢复窗口；
- 刷新；
- 关闭再打开；
- 多版本增删；
- 手动修改；
- 保存后重新加载；
- 发送到 TTS；
- 不同项目相同版本键；
- 浏览器旧键迁移。

### 13.2 TTS / BGM

- 无 BGM 三件套；
- 有 BGM 四件套；
- BGM 生成成功；
- BGM 生成失败但旁白成功；
- BGM 补生成；
- BGM 播放条可见；
- BGM 音量实时调整；
- 父旁白和 BGM 关联；
- 刷新后恢复；
- 删除父旁白；
- 删除 BGM；
- 旧 BGM 不得关联新旁白；
- 字幕确认前禁止发送；
- 修改字幕后 revision 更新。

### 13.3 每条生产线

- 接收三件套；
- 接收四件套；
- 默认是否加入符合产品规则；
- 手动关闭 BGM；
- 手动开启 BGM；
- 预览可听；
- 播放条可见；
- 音量可调；
- 最终 MP4 可听；
- 刷新恢复；
- 页面切换恢复；
- 重启恢复；
- 输出路径存在；
- 下载内容与预览一致；
- 失败后可重试；
- 旧任务结果不得覆盖新任务。

### 13.4 小黑专项

- 一键添加单图；
- 一键添加多图；
- 场景顺序；
- 缺图提示；
- 刷新后绑定；
- 图片格式和大小；
- 1.0/1.1/1.2/1.3 倍速；
- 字幕、TTS、画面、BGM 结束点；
- iframe 重载；
- 父页重新发送 handoff。

### 13.5 MoneyPrinter 专项

- 8080 自动启动；
- 8080 已运行复用；
- 瞬时 fetch 失败；
- 素材 API 降级；
- 长时间 50% 但任务仍运行；
- 8787 重启恢复映射；
- 8080 重启；
- 官方任务不存在；
- 最终二次渲染有 BGM；
- 最终文件 URL 重启后仍可恢复；
- 预览视频和最终视频来源明确。

### 13.6 安全

- 静态路径编码穿越；
- Host / Origin / Cookie；
- 任意本地文件读取；
- Webpage 私网和重定向 SSRF；
- 超大 HTML；
- 恶意文件名和标题 XSS；
- 设置并发写；
- 损坏 JSON；
- 超大上传；
- 子进程参数注入；
- 下载/删除范围。

## 14. 发布和回滚流程

每个修复包：

1. 核对分支、上游、工作树、子模块；
2. 建立可复现失败；
3. 先提交回归测试；
4. 实现最小修复；
5. 跑定向测试；
6. 跑 `npm.cmd run check:gate`；
7. 跑真实浏览器测试；
8. 涉及媒体时跑真实媒体测试；
9. 跑 `git diff --check`；
10. 只暂存该修复包文件；
11. 提交到修复分支；
12. 推送后通过 PR；
13. 合并后的 `main` 再跑一次发布门禁；
14. 记录 commit、输入 fixture、输出文件和验证报告。

回滚要求：

- 代码回滚和数据迁移回滚分开；
- 新表迁移先保留旧数据；
- 媒体文件不原地覆盖；
- 设置迁移保留可恢复备份；
- localStorage 只定向迁移命名空间；
- 子模块指针和补丁文件必须匹配；
- 回滚后同样运行门禁和关键真实场景。

## 15. 当前真实验证结果

### 15.1 已执行并通过

`npm.cmd run check:gate`

结果：

- JavaScript syntax：178 files OK；
- 安装与下载目录检查通过；
- 小黑提示词和一键图片源码/逻辑测试通过；
- MoneyPrinter 启动、单实例和素材降级测试通过；
- 文案、TTS、字幕、交接和动态大字相关门禁通过；
- 静态路径安全通过；
- 本地 API 信任边界通过；
- 动态大字真实短 MP4 render smoke 通过；
- 设置密钥安全测试通过。

执行时间约 100 秒，退出码 0。

`npm.cmd run test:http-contract`

结果：

- 22 passed；
- 0 failed；
- 退出码 0。

但该脚本的证明范围主要是 HTTP 与源码契约，不能替代真实浏览器和真实四条生产线成片验收。

`pnpm.cmd audit --prod --json`

结果：

- 8 high；
- 17 moderate；
- 1 low；
- 因存在告警，审计本身不应视为通过。

### 15.2 当前不能声明已通过

- 改写串稿真实浏览器回归；
- BGM 播放条真实浏览器回归；
- 四条生产线 BGM 实际可听；
- 四条生产线相同四件套的最终 MP4 对比；
- MoneyPrinter 最终二次合成 BGM；
- 8787 重启后的 MoneyPrinter 任务恢复；
- 依赖安全审计清零或风险接受；
- 当前修复分支合并 `main` 后的发布验证。

## 16. 完成定义

一项问题只有同时满足下面条件才算完成：

1. 有固定复现步骤；
2. 修复前测试稳定失败；
3. 修复后测试稳定通过；
4. 相关代码门禁通过；
5. 页面问题经过真实浏览器操作；
6. 媒体问题有真实输出文件；
7. 输出文件通过 FFprobe / 音频规则；
8. 预览加载的就是最终资产；
9. 刷新、页面切换和服务重启不回归；
10. 没有覆盖历史原件，或已明确迁移/覆盖范围；
11. 提交只包含本项文件；
12. 已推送并通过 PR/CI；
13. 合并后的正式分支再次验证；
14. 交接记录包含提交哈希、测试结果和实际产物路径。

明确禁止以下“完成”说法：

- 只改了源码，没有运行；
- 只跑了字符串测试；
- 只看到进度 100%；
- 只看到后台播放，没有可见播放器；
- 只看到四件套文字，没有检查目标页面；
- 只看到目标页面 BGM 状态，没有检查最终 MP4；
- 只看到文件存在，没有验证可解码；
- 本地修复分支通过，但正式分支未合并；
- 外部服务没实际调用，却说真实生成通过。

## 17. 建议执行顺序

第一批，立即阻止继续产生错误数据：

1. 真实浏览器测试底座；
2. 改写跨任务草稿污染；
3. MoneyPrinter 最终 BGM；
4. MoneyPrinter 任务映射持久化；
5. 四条生产线同一四件套真实验收。

第二批，消除重复故障来源：

1. 服务端 handoff；
2. 统一 jobs；
3. 设置单入口和原子写；
4. 动态大字项目原子存储；
5. 最终资产统一注册。

第三批，安全和长期维护：

1. SSRF；
2. DOM XSS；
3. 依赖升级；
4. 编码清理；
5. 超大文件拆分；
6. 发布版本统一。

## 18. 接手人员第一天检查清单

- [ ] 确认当前分支和 commit；
- [ ] 确认工作树没有混入其他改动；
- [ ] 确认 MoneyPrinter 子模块提交；
- [ ] 备份数据库与设置；
- [ ] 运行当前 `check:gate`；
- [ ] 运行当前 HTTP/源码 `test:http-contract`；
- [ ] 用浏览器复现任务 A 草稿覆盖任务 B；
- [ ] 用固定 TTS+BGM fixture 复现 MoneyPrinter 最终无 BGM；
- [ ] 记录 8787 重启前后的 MPT 包装任务；
- [ ] 创建第一批三个独立修复分支或提交序列；
- [ ] 不执行 `git add -A`；
- [ ] 不清理用户历史输出；
- [ ] 不在没有真实产物时写“已完成”。

## 19. 关键文件索引

启动与主服务：

- `start-ui-hidden.vbs`
- `launch-ui.mjs`
- `ui-server.mjs`

前端：

- `ui/index.html`
- `ui/app.js`
- `ui/workbench.js`
- `ui/modules/legacy-runtime.js`
- `ui/modules/tts-handoff-store.js`
- `ui/modules/cs1-video.js`
- `ui/modules/ian-xiaohei-app.js`
- `ui/modules/money-printer.js`
- `ui/modules/kinetic-text.js`

存储与核心：

- `task-store.mjs`
- `server/core/project-center.js`
- `server/core/task-center.js`
- `server/core/queue-manager.js`
- `server/core/pipeline-bus/PipelineState.js`
- `server/core/settings-center.js`

媒体与生产线：

- `server/tts/tts-service.js`
- `server/routes/cs1-video-routes.js`
- `server/routes/ian-xiaohei-routes.js`
- `server/xiaohei-video-renderer.js`
- `server/routes/money-printer-routes.js`
- `server/routes/kinetic-text-routes.js`
- `server/kinetic-text/kinetic-text-service.js`

安全：

- `server/core/static-path-safety.js`
- `server/utils/http-body.js`
- `server/core/adapters/webpage-adapter.js`
- `test-static-path-safety.mjs`
- `test-local-api-trust-boundary.mjs`

发布与门禁：

- `package.json`
- `.github/workflows/backup-check.yml`
- `sync-project.mjs`
- `.agents/skills/douyin-safe-change/SKILL.md`
- `test-http-contract.mjs`
- `test-page-lifecycle.mjs`

历史参考：

- `docs/code-audit-2026-07-19.md`
- `docs/p0-stability-handoff.md`
- `docs/product-technical-roadmap.md`
- `docs/moneyprinterturbo-v1.3.3-repair-handoff-2026-07-24.md`

---

本交接的核心原则：

> 先证明真实故障，再修唯一根因；先证明真实产物，再宣布完成。源码中“看起来已经接上”不等于用户实际页面和最终视频已经正确。
