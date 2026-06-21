# 视频输出路线

## 当前主路线

普通用户默认使用 **剪映模板草稿【推荐】**：VideoProject 先通过现有 readiness 检查，再转换为统一的 capcut 执行计划，用剪映母版替换配音、BGM、分镜素材、字幕、标题、CTA 和封面。

如果本机没有 `capcut-cli`、没有配置剪映草稿目录，或模板母版尚未放入项目，任务不会崩溃。系统会输出 `capcut-plan.json`、时间线、字幕和素材文件，并明确标记为“素材包兼容模式”。

## 备用路线

- **MP4 预览**：使用现有 FFmpeg 渲染能力，检查画面、字幕和音频，不代替剪映母版成片。
- **标准素材包 / 兼容导出**：输出图片、音频、字幕、时间线和项目清单，供人工导入或其他工具消费。
- **路线 A/B/C/D**：保留在高级输出方式中，兼容旧项目和专项生产，不再作为普通用户首页主入口。

## 不再作为主路线

- HyperFrames 保留为专项动画能力，不再承担默认成片路线。
- 手动生成 `draft_content.json` / `draft_meta_info.json` 的导出器标记为 `LegacyJianyingExporter`，仅用于历史兼容、简单实验和故障回退。
- 系统不会把自造剪映 JSON 描述为高质量剪映工程。

## 工具评估

### capcut-cli

本机剪映专业版与 `capcut-cli` 是两项独立能力：系统会从本地设置、用户/系统开始菜单快捷方式和常见安装目录检测剪映客户端，并自动识别默认草稿目录；检测到客户端后，成片中心可直接启动剪映。仅安装剪映客户端并不代表模板命令已经可用，缺少 `capcut-cli` 或母版时仍使用素材包兼容模式。

当前首选适配目标。优点是可以通过进程边界隔离，并按 `doctor / info / lint / import-srt / add-audio / add-image / apply-template / render preview` 分步执行。由于不同安装版本的命令能力可能不同，所有调用必须先检测并允许兼容降级。

### pyJianYingDraft

适合作为后续 Python 侧草稿操作候选，API 表达力较好，但会引入 Python 环境、剪映版本兼容和双运行时维护成本。本阶段不加入主启动链路。

### capcut-mate

可作为本地剪辑自动化候选。正式接入前需要单独验证维护状态、命令稳定性、Windows 路径支持和剪映版本兼容，因此本阶段只保留评估结论，不引入依赖。

## 下一阶段

1. 用户在剪映中制作六类 9:16 母版，并复制到对应 `templates/jianying/*/draft_template/`。
2. 根据实际安装的 capcut-cli 版本补齐命令映射测试。
3. 将草稿结果关联回现有 VideoProject 的 `jianyingDraft` 和 `outputHistory`。
4. 在不改变 `node ui-server.mjs` 启动方式的前提下，逐步把服务路由拆分到 `server/routes/`。
