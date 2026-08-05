import crypto from "node:crypto";

export const REQUIRED_GATES_BY_MODE = {
  control: ["A 代码", "B 逻辑", "C 功能", "F 数据与回滚"],
  automated: ["A 代码", "B 逻辑", "C 功能", "F 数据与回滚"],
  "browser-real": ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "F 数据与回滚"],
  "external-real": ["B 逻辑", "C 功能", "D 真实使用", "F 数据与回滚"],
  "restart-real": ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "F 数据与回滚"],
  "security-dynamic": ["A 代码", "B 逻辑", "C 功能", "E 安全", "F 数据与回滚"],
  "release-local": ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "E 安全", "F 数据与回滚", "G 发布"],
  "remote-gate": ["C 功能", "D 真实使用", "F 数据与回滚", "G 发布"],
  "production-media": ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "F 数据与回滚"],
  "user-assisted": ["C 功能", "D 真实使用", "F 数据与回滚"],
  "user-acceptance": ["D 真实使用", "G 发布"],
  "cleanup-audit": ["B 逻辑", "C 功能", "D 真实使用", "F 数据与回滚"],
  "behavior-preserving-refactor": ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "F 数据与回滚"],
};

export function requiredGatesForMode(mode) {
  return REQUIRED_GATES_BY_MODE[mode] || ["A 代码", "B 逻辑", "C 功能", "F 数据与回滚"];
}

function addUnique(target, values) {
  for (const value of values) if (value && !target.includes(value)) target.push(value);
}

function sourceAnchors(row) {
  const text = `${row.lane} ${row.title} ${row.acceptance}`;
  const anchors = [];
  if (row.id.startsWith("R2-00.")) addUnique(anchors, ["package.json", ".agents/skills/", "scripts/"]);
  if (/TTS|旁白|声音|BGM/.test(text)) addUnique(anchors, ["server/tts/", "server/tts/tts-handoff-service.mjs", "ui/modules/tts-handoff-store.js", "ui/workbench.js"]);
  if (/朋友圈|微信|改写|文案/.test(text)) addUnique(anchors, ["ui/workbench.js", "ui/modules/legacy-runtime.js", "ui-server.mjs"]);
  if (/CS1/.test(text)) addUnique(anchors, ["server/routes/cs1-video-routes.js", "ui/modules/cs1-video.js", "skills/cs1/SKILL.md"]);
  if (/小黑/.test(text)) addUnique(anchors, ["server/routes/ian-xiaohei-routes.js", "server/xiaohei-video-renderer.js", "ui/modules/xiaohei-production.js"]);
  if (/MoneyPrinter/.test(text)) addUnique(anchors, ["server/routes/money-printer-routes.js", "server/core/money-printer-store.js", "ui/modules/money-printer.js"]);
  if (/动态大字|时间轴|seek/.test(text)) addUnique(anchors, ["server/kinetic-text/kinetic-text-service.js", "server/routes/kinetic-text-routes.js", "ui/modules/kinetic-text.js"]);
  if (/启动|launcher|VBS|单实例|8787|8080/.test(text)) addUnique(anchors, ["start-ui-hidden.vbs", "launch-ui.mjs", "ui-server.mjs"]);
  if (/安全|漏洞|依赖审计|CIDR|SSRF|CORS|brace|fast-uri|ip-address|Hono/.test(text)) addUnique(anchors, ["package.json", "pnpm-lock.yaml", "server/core/ssrf-guard.mjs", "test-ssrf-guard.mjs"]);
  if (/发布|PR|CI|合并|回滚|清单|冻结|干净安装|结构版/.test(text)) addUnique(anchors, ["package.json", "scripts/release-gate.mjs", "scripts/service-restart.mjs", "docs/"]);
  if (/设置|SQLite|JSON|资产|任务|工作流/.test(text)) addUnique(anchors, ["server/core/settings-center.js", "server/core/task-center.js", "server/core/final-asset-registry.js", "ui-server.mjs"]);
  if (/图片|Director|APS|VFO/.test(text)) addUnique(anchors, ["server/image/image-service.js", "server/routes/ian-xiaohei-routes.js", "ui/modules/ian-xiaohei-app.js"]);
  if (/路由/.test(text)) addUnique(anchors, ["ui-server.mjs", "server/routes/", "server/core/"]);
  if (/生命周期|owner|dispose|监听|轮询|RAF|timer/.test(text)) addUnique(anchors, ["ui/workbench.js", "ui/modules/", "test-page-lifecycle.mjs"]);
  if (/清理|隔离|无用文件|死代码/.test(text)) addUnique(anchors, [".data/repair-evidence/R2-CLEANUP-AUDIT/", ".gitignore", "docs/"]);
  if (!anchors.length) addUnique(anchors, ["ui-server.mjs", "ui/workbench.js", "server/core/"]);
  return anchors;
}

const ITEM_PROFILES = {
  "R2-00.01": { mode: "control", regression: "不适用：只读快照项不制造修复前失败", test: "不新增：复验 manifest.sha256、git-state.json 与 file-inventory.json", commands: ["node .agents/skills/douyin-repair-supervisor/scripts/capture-repair-baseline.mjs R2-PREFLIGHT --plan <02表绝对路径>"] },
  "R2-00.02": { mode: "control", regression: "不适用：可恢复备份项以恢复校验为失败判据", test: "不新增：运行备份与恢复校验脚本", commands: ["node .agents/skills/douyin-repair-supervisor/scripts/verify-runtime-backup.mjs <备份目录>"] },
  "R2-00.03": { mode: "control", regression: "独立监督器自测必须证明第5次被拒绝且第一轮哈希不变", test: ".agents/skills/douyin-round2-supervisor/scripts/test-round2-supervisor.mjs", commands: ["pnpm.cmd run repair:r2:test-supervisor", "pnpm.cmd run repair:r2:check"] },
  "R2-00.04": { mode: "control", regression: "现有41项不能逐项隔离、超时和恢复服务时失败", test: "test-round2-complete-runner.mjs", commands: ["node test-round2-complete-runner.mjs", "node test-release-gate-scope.mjs"] },
  "R2-00.05": { mode: "control", regression: "不适用：能力预检以真实安装和阻塞登记为判据", test: "不新增：分别运行 Skill quick_validate 和浏览器能力探针", commands: ["pnpm.cmd run repair:r2:check", "node test-browser-behavior-scope.mjs"] },
  "R2-00.06": { mode: "control", regression: "旧规则仍允许 A 写总表/合并、A 超过2次、双机路径重叠或业务项未先研究", test: ".agents/skills/douyin-round2-supervisor/scripts/test-round2-supervisor.mjs", commands: ["pnpm.cmd run repair:r2:test-supervisor", "pnpm.cmd run repair:r2:check"] },
  "R2-01.01": { mode: "browser-real", test: "test-tts-auto-preview.mjs", commands: ["node test-tts-auto-preview.mjs"] },
  "R2-01.02": { mode: "browser-real", test: "test-tts-bgm-option.mjs", commands: ["node test-tts-bgm-option.mjs", "node test-tts-bgm-persistence.mjs"] },
  "R2-01.03": { mode: "browser-real", test: "test-tts-bundle-labels.mjs", commands: ["node test-tts-bundle-labels.mjs", "node test-tts-bgm-persistence.mjs"] },
  "R2-01.04": { mode: "browser-real", test: "test-tts-bgm-player.mjs", commands: ["node test-tts-bgm-player.mjs"] },
  "R2-01.05": { mode: "browser-real", test: "test-round2-voices-navigation-browser.mjs", commands: ["node test-round2-voices-navigation-browser.mjs", "node test-dom-xss-dataflow.mjs"] },
  "R2-01.06": { mode: "browser-real", test: "test-round2-files-navigation-browser.mjs", commands: ["node test-round2-files-navigation-browser.mjs", "node test-download-safety.mjs"] },
  "R2-01.07": { mode: "browser-real", test: "test-kinetic-bgm-player-browser.mjs", commands: ["node test-kinetic-bgm-player-browser.mjs"] },
  "R2-01.08": { mode: "browser-real", test: "test-money-printer-final-asset-browser.mjs", commands: ["node test-money-printer-final-asset-browser.mjs", "node test-money-printer-restart-recovery.mjs"] },
  "R2-01.09": { mode: "external-real", regression: "真实微信桌面端到移动端粘贴仍出现乱码、缺字或样式丢失", test: "不新增自动化替代：保存真实微信输入、桌面粘贴和移动端结果截图或录屏", commands: ["node test-moments-emoji-audit.mjs", "node test-moments-emoji-platform.mjs"] },
  "R2-01.10": { mode: "external-real", regression: "授权供应商生成任务未形成API、SQLite、文件、页面、刷新和handoff闭环", test: "test-tts-auto-preview.mjs（使用本轮授权账号和新任务ID）", commands: ["node test-tts-auto-preview.mjs", "node test-production-tts-integrity.mjs"] },
  "R2-01.11": { mode: "external-real", regression: "授权BGM任务未形成独立文件、正确关联和完整发送闭环", test: "test-tts-bgm-generation.mjs（使用本轮授权账号和新任务ID）", commands: ["node test-tts-bgm-generation.mjs", "node test-tts-bgm-tail.mjs", "node test-tts-bgm-loudness.mjs"] },
  "R2-01.12": { mode: "automated", test: "test-launcher-missing-dependency.mjs", commands: ["node test-launcher-missing-dependency.mjs"] },
  "R2-01.13": { mode: "automated", test: "test-launcher-log-rotation.mjs", commands: ["node test-launcher-log-rotation.mjs"] },
  "R2-01.14": { mode: "automated", test: "test-launcher-project-identity.mjs", commands: ["node test-launcher-project-identity.mjs"] },
  "R2-01.15": { mode: "restart-real", test: "test-launcher-single-instance.mjs", commands: ["node test-launcher-single-instance.mjs", "pnpm.cmd run test:restart"] },
  "R2-02.01": { mode: "security-dynamic", test: "test-fast-uri-host-confusion.mjs", commands: ["node test-fast-uri-host-confusion.mjs", "pnpm.cmd audit --prod"] },
  "R2-02.02": { mode: "security-dynamic", test: "test-ip-address-leading-zero.mjs", commands: ["node test-ip-address-leading-zero.mjs", "node test-ssrf-guard.mjs", "pnpm.cmd audit --prod"] },
  "R2-02.03": { mode: "security-dynamic", test: "test-cidr-normalization.mjs", commands: ["node test-cidr-normalization.mjs", "node test-ssrf-guard.mjs"] },
  "R2-02.04": { mode: "security-dynamic", test: "test-socket-target-revalidation.mjs", commands: ["node test-socket-target-revalidation.mjs", "node test-ssrf-guard.mjs"] },
  "R2-02.05": { mode: "security-dynamic", test: "test-hono-cors-redos.mjs", commands: ["node test-hono-cors-redos.mjs", "pnpm.cmd audit --prod"] },
  "R2-02.06": { mode: "security-dynamic", test: "test-brace-expansion-dos.mjs", commands: ["node test-brace-expansion-dos.mjs", "pnpm.cmd audit --prod"] },
  "R2-02.07": { mode: "security-dynamic", regression: "生产依赖仍有未接受中高危或PR未留下独立审查记录", test: "test-production-dependency-audit-scope.mjs", commands: ["pnpm.cmd audit --prod", "node test-production-dependency-audit-scope.mjs"] },
  "R2-03.01": { mode: "release-local", test: "test-isolated-frozen-install.mjs", commands: ["node test-isolated-frozen-install.mjs", "pnpm.cmd run test:gate"] },
  "R2-03.02": { mode: "release-local", test: "test-clean-browser-release-gate.mjs", commands: ["node test-clean-browser-release-gate.mjs", "node test-round2-complete-runner.mjs"] },
  "R2-03.03": { mode: "remote-gate", regression: "PR候选清单含未授权、敏感、证据、用户资产或子模块文件", test: "test-round2-pr-slice-policy.mjs", commands: ["node test-round2-pr-slice-policy.mjs", "git diff --cached --name-status"] },
  "R2-03.04": { mode: "remote-gate", regression: "当前PR head任一必需检查失败、缺失或对应旧提交", test: "不新增本地替代：保存 gh pr checks 与当前PR head SHA", commands: ["gh pr checks", "gh pr view --json headRefOid,statusCheckRollup"] },
  "R2-03.05": { mode: "remote-gate", regression: "未授权合并或main运行commit、迁移、锁文件、子模块指针不一致", test: "test-main-runtime-identity.mjs", commands: ["git rev-parse main", "node test-main-runtime-identity.mjs"] },
  "R2-04.09": { mode: "release-local", test: "test-release-manifest-r2.mjs", commands: ["node test-release-manifest-r2.mjs", "node scripts/release-gate.mjs"] },
  "R2-04.10": { mode: "user-assisted", regression: "回滚或恢复演练造成代码、设置、数据库、项目或资产指针丢失", test: "test-round2-rollback-restore.mjs", commands: ["node test-round2-rollback-restore.mjs", "pnpm.cmd run test:restart"] },
  "R2-04.11": { mode: "user-acceptance", regression: "用户尚未按真实工作流明确验收稳定版", test: "不新增自动化代签：保存用户确认与对应commit/证据目录", commands: ["node scripts/release-gate.mjs", "pnpm.cmd run repair:r2:check"] },
  "R2-04.12": { mode: "cleanup-audit", regression: "候选仍有引用、无恢复映射或隔离后任一完整门禁失败", test: "test-cleanup-quarantine-roundtrip.mjs", commands: ["node test-cleanup-quarantine-roundtrip.mjs", "node test-round2-complete-runner.mjs"] },
  "R2-06.01": { mode: "release-local", test: "test-structural-complete-runner.mjs", commands: ["node test-structural-complete-runner.mjs", "node scripts/release-gate.mjs"] },
  "R2-06.02": { mode: "external-real", regression: "external结果为空、沿用旧任务或本轮授权任务任一失败", test: "test-structural-external-gate.mjs（仅接受本轮真实任务ID与文件）", commands: ["node test-structural-external-gate.mjs"] },
  "R2-06.03": { mode: "release-local", test: "test-structural-clean-install.mjs", commands: ["node test-structural-clean-install.mjs", "node scripts/release-gate.mjs"] },
  "R2-06.04": { mode: "production-media", regression: "8个main成片任一缺失、复用资产或最终混音/页面哈希不一致", test: "test-structural-eight-production-assets.mjs", commands: ["node test-structural-eight-production-assets.mjs", "node scripts/verify-production-media.mjs --line <line> --artifact <本轮最终文件> --narration <本轮旁白> --bgm <四件套BGM> --report <本轮证据JSON>"] },
  "R2-06.05": { mode: "remote-gate", regression: "PR/CI/main/清单/回滚任一证据不对应当前结构版commit", test: "test-structural-release-identity.mjs", commands: ["gh pr checks", "node test-structural-release-identity.mjs"] },
  "R2-06.06": { mode: "user-acceptance", regression: "用户未确认或总表、Git/PR/CI、8成片、回滚任一缺证", test: "不新增自动化代签：保存用户最终确认和全证据索引", commands: ["pnpm.cmd run repair:r2:check", "node scripts/release-gate.mjs"] },
};

function productionProfile(row) {
  const line = row.lane === "CS1" ? "cs1" : row.lane === "小黑" ? "xiaohei" : row.lane === "MoneyPrinter 集成" ? "money-printer" : "kinetic-text";
  const withBgm = /四件套/.test(row.title);
  const command = `node scripts/verify-production-media.mjs --line ${line} --artifact <本轮最终文件> --narration <本轮旁白>${withBgm ? " --bgm <本轮独立BGM>" : ""} --report <本项证据目录>/production-media.json`;
  const browserTests = {
    cs1: "node test-cs1-complete-acceptance.mjs",
    xiaohei: "node test-xiaohei-sync-matrix.mjs",
    "money-printer": "node test-money-printer-final-asset-browser.mjs",
    "kinetic-text": "node test-kinetic-bgm-player-browser.mjs",
  };
  return {
    mode: "production-media",
    regression: `本轮${withBgm ? "四件套" : "三件套"}真实成片的流、时长、解码、混音特征、asset ID 或预览/下载哈希不满足验收`,
    test: `test-${row.id.toLowerCase().replaceAll(".", "-")}-production.mjs`,
    commands: [command, browserTests[line]],
  };
}

function profileFor(row) {
  if (ITEM_PROFILES[row.id]) return ITEM_PROFILES[row.id];
  if (/^R2-04\.0[1-8]$/.test(row.id)) return productionProfile(row);
  const test = `test-${row.id.toLowerCase().replaceAll(".", "-")}.mjs`;
  return {
    mode: row.id.startsWith("R2-05.") ? "behavior-preserving-refactor" : "automated",
    regression: `${test} 必须在变更前暴露“${row.title}”当前契约缺口或在重构前冻结零行为差异基线`,
    test,
    commands: [`node ${test}`],
  };
}

export function planDefinitionFingerprint(rows) {
  const normalized = rows.map((row) => ({
    id: row.id,
    lane: row.lane,
    priority: row.priority,
    manual: row.manual,
    dependencies: row.dependencies,
    title: row.title,
    acceptance: row.acceptance,
  }));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function buildExecutionSpecs(rows) {
  return rows.map((row) => {
    const profile = profileFor(row);
    const evidenceDir = `.data/repair-evidence/${row.id}/<YYYYMMDD-HHMMSS>/`;
    const commands = [...new Set([...profile.commands, "pnpm.cmd run check:gate"] )];
    return {
      id: row.id,
      card: {
        scope: `${row.lane}｜${row.title}`,
        verificationMode: profile.mode,
        orderedActions: [
          `冻结 ${row.id} 开工时的 Git、运行状态、输入与输出证据`,
          `沿 ${sourceAnchors(row).join("、")} 定位真实状态所有者和调用链`,
          `建立失败判据：${profile.regression || `${profile.test} 在修复前稳定失败`}`,
          `逐项复验完成判定：${row.acceptance}`,
          `执行目标回归、完整门禁，并把真实产物写入 ${evidenceDir}`,
        ],
        failingRegression: profile.regression || profile.test,
        targetedChecks: commands,
        realEvidence: `必须保存与“${row.acceptance}”直接对应的真实输出、日志、页面或媒体证据，不能用代码存在代替。`,
        prohibitedShortcuts: [
          "不得以提示词、延时、默认值、假数据或静态断言掩盖根因",
          "不得修改第一轮总表、第一轮证据或第一轮两次状态机",
          "不得触碰 MoneyPrinterTurbo 子模块内部；相关项只改主程序集成边界",
          "不得把四次失败待最终收尾计为完成或满足硬门禁",
        ],
        rollback: "只回滚本项目明确列出的本轮文件；先保护用户数据、历史输出、设置、SQLite、证据和子模块指针。",
        escalation: row.manual
          ? "需要人工、账号、付费、PR、CI、main 或用户验收时登记证据；5 分钟无人介入则顺移到其他就绪项。"
          : "连续第 4 次完整维修复验仍失败时登记为四次失败待最终收尾并推进；禁止第 5 次普通维修。",
      },
      run: {
        sourceAnchors: sourceAnchors(row),
        commands,
        testToAdd: profile.test,
        requiredEvidence: row.acceptance,
        evidenceDir,
      },
    };
  });
}
