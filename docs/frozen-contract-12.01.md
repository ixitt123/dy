# 12.01 合格版行为与结构改造边界冻结

建立日期：2026-07-31
维修者：小白（WorkBuddy）
分支：fix/p0-stability（代码改动在工作树，待 git 整合）

本文件冻结合格稳定版的不可改变契约。阶段 12 结构重构不得破坏以下任何契约。

## 1. UI 契约（不可改变）

### 1.1 页面导航结构
- `data-nav` 属性标识导航项：dashboard / collector / rewrite / moments-copy / tts / voices / kinetic-text / cs1-video / money-printer / xiaohei-video / assets / settings
- `data-page` 属性标识页面区域，与 data-nav 一一对应
- `.active` class 标识当前激活页面

### 1.2 关键元素 ID（不可删除/重命名）
- 版本徽标：`#runtimeVersionBadge` + `.rv-branch/.rv-commit/.rv-buildtime/.rv-submodule`
- 改写：`#rewriteTaskId` / `#rewriteOriginal`
- TTS：`#ttsPreview` / `#ttsBgmPreview` / `#ttsBgmVolume` / `#ttsGenerateCleanEducationBgm`
- BGM 勾选：`#cs1VideoIncludeBgm` / `#moneyPrinterIncludeBgm` / `#kineticIncludeBgm` / `#xiaoheiIncludeBgm`
- 动态大字：`#kineticPreviewCanvas` / `#kineticRenderFinal`
- 小黑：`#xiaoheiVideoCanvas` / `#xiaoheiPlaybackSpeed`

### 1.3 CSS class 契约
- `.tts-history-files.has-bgm::before` content: "四件套"
- `.runtime-version-badge` 版本徽标样式

## 2. API 契约（不可改变）

### 2.1 核心 API 端点
- `GET /api/status` → 返回 { ok, tasks, lifecycle, modelRouter, runtimeVersion }
- `GET /api/task-center/stats` → 任务统计
- `POST /api/analyze` → 内容分析（含 SSRF 防护）
- `GET /api/providers/list` → Provider 列表
- `GET /api/settings/model-mapping` → 模型映射
- `GET /api/image/stats` → 图片统计

### 2.2 生产线 API
- TTS：`/api/tts/alignment/realign` / `/api/tts/alignment/confirm` / `/api/tts/jobs`
- MoneyPrinter：render-final（含 BGM 混音 bgm_file/bgm_volume）
- CS1：mixCs1BgmIntoVideo（afade 淡出）
- 小黑：render-video / upload-video-bgm
- 动态大字：renderFinal（amix BGM 混音）

### 2.3 安全契约
- 本地 API 信任边界：isAllowedLocalHostHeader（127.0.0.1/localhost/::1）
- Cookie：`__dy_local_api_<port>` HttpOnly SameSite=Strict
- SSRF 防护：assertSafeUrl + safeFetch（私网/DNS重绑定/协议/重定向/响应体限制）

## 3. 数据契约（不可改变）

### 3.1 SQLite 表
- 任务队列、TTS jobs、图片 jobs 等（WAL 模式，原子性保证）
- 12 个 SQLite 文件在 .data/ 目录

### 3.2 JSON 数据结构
- settings.json：模型映射、Provider 配置（原子写入 writeJsonAtomic）
- manifest.json：生产线 manifest（含 bgm 字段）
- fixtures/：7 场景固定测试输入

### 3.3 localStorage 键
- 草稿键：dataIdentity 含 task（field/provider/task/target/draftKey）
- 不使用 localStorage.clear()，只定向 removeItem

### 3.4 handoff 协议
- 三件套：旁白音频 + 文案 + 带时间戳字幕
- 四件套：三件套 + 独立 BGM
- parent_tts_job_id 关联父 TTS
- bgm_path / bgm_volume / bgm_type 传递

## 4. 导出契约（不可改变）

### 4.1 视频导出
- MP4（libx264 + aac）
- MoneyPrinter：renderFinalVideo outputPath
- 动态大字：renderFinal outputPath
- 小黑：renderXiaoheiVideo outputPath
- CS1：generateVideo outputPath

### 4.2 音频导出
- TTS 旁白：mp3/m4a
- BGM：独立文件（type: "bgm"）

### 4.3 字幕导出
- ASS 格式（动态大字 + MoneyPrinter）
- 带时间戳字幕（TTS alignment）

## 5. 媒体契约（不可改变）

### 5.1 视频规格
- 编码：libx264（CRF 19，preset veryfast）
- 音频：aac 192k
- 帧率：30/60fps
- 宽高比：9:16 / 16:9 等

### 5.2 BGM 混音规格
- 四条生产线均用 amix 混音（TTS + BGM）
- BGM 音量：默认 0.18（18%）作为起点
- 淡出：MoneyPrinter 2s / 小黑 0.8s / CS1 0.8s（待真实媒体校准）
- BGM 循环：aloop 到 TTS 时长

### 5.3 响度
- EBU R128 标准（I/LRA/TP）
- 人声为主，BGM 为辅

## 6. 结构改造边界（阶段 12 不得越过）

### 6.1 允许的结构改造
- 拆分 ui-server.mjs 路由（主文件只做装配）
- 拆分大页面模块（每页一个状态所有者）
- 提取公共媒体层（音量/淡出/时长/检测只实现一份）

### 6.2 禁止的结构改造
- 删除上述任何 UI/API/数据/导出/媒体契约
- 改变 localStorage 键方案（task 作用域）
- 移除 SSRF 防护 / 原子写入 / 安全边界
- 降低测试断言来让测试变绿
- 删除测试底座（browser-cdp / media-verifier / service-restart / release-gate）

## 7. 验证要求

每次结构改造后必须重新通过：
- test:http-contract（22 项契约）
- test:browser-smoke（6 项浏览器）
- test:media-verifier（7 项媒体）
- test:service-restart（8 项重启）
- test:rewrite-crossover（5 项串稿）
- test:ssrf-guard（13 项 SSRF）
- test:atomic-write（6 项原子写入）
- check:syntax（191 文件语法）
