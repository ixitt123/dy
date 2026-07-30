import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDesktopDateFolder,
  deleteEmptyDesktopNamedFolder,
  formatLocalDate,
  listDesktopImageSequenceFromReference,
  listLatestDesktopImageBatch,
  normalizeDesktopFolderName,
  renameDesktopNamedFolder,
} from "./server/core/desktop-date-folder.js";
import { resolveFolderNameSelection } from "./ui/modules/desktop-folder-selection.js";
import { createImageService } from "./server/image/image-service.js";
await import("./ui/modules/moments-image-instruction.js");
const { buildMomentsImageInstruction } = globalThis;

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const tempDesktop = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-date-folder-"));

try {
  const date = new Date(2026, 6, 23, 14, 33, 0);
  assert.equal(formatLocalDate(date), "2026-07-23");

  const first = createDesktopDateFolder({ desktopDir: tempDesktop, now: date });
  assert.equal(path.basename(first.folderPath), "2026-07-23");
  for (const name of ["语文", "数学", "英语", "政策"]) {
    assert.equal(fs.statSync(path.join(first.folderPath, name)).isDirectory(), true);
  }

  const second = createDesktopDateFolder({ desktopDir: tempDesktop, now: date });
  assert.equal(path.basename(second.folderPath), "2026-07-23-2");

  assert.equal(normalizeDesktopFolderName("  图片约束2  "), "图片约束2");
  assert.throws(() => normalizeDesktopFolderName("../越界"), /不能包含/);
  const named = createDesktopDateFolder({
    desktopDir: tempDesktop,
    now: date,
    suffix: "图片约束2",
  });
  assert.equal(path.basename(named.folderPath), "2026-07-23-图片约束2");
  const renamed = renameDesktopNamedFolder({
    desktopDir: tempDesktop,
    folderPath: named.folderPath,
    fromSuffix: "图片约束2",
    toSuffix: "方法",
  });
  assert.equal(path.basename(renamed.folderPath), "2026-07-23-方法");
  assert.equal(fs.existsSync(named.folderPath), false);
  assert.equal(fs.existsSync(renamed.folderPath), true);
  assert.equal(
    deleteEmptyDesktopNamedFolder({
      desktopDir: tempDesktop,
      folderPath: renamed.folderPath,
      suffix: "方法",
    }).deleted,
    true,
    "只有空的默认子目录时允许删除",
  );
  assert.equal(fs.existsSync(renamed.folderPath), false);

  const protectedFolder = createDesktopDateFolder({
    desktopDir: tempDesktop,
    now: date,
    suffix: "不可删除",
  });
  fs.writeFileSync(path.join(protectedFolder.folderPath, "素材.png"), "image");
  assert.throws(
    () => deleteEmptyDesktopNamedFolder({
      desktopDir: tempDesktop,
      folderPath: protectedFolder.folderPath,
      suffix: "不可删除",
    }),
    /请先清空文件夹/,
    "包含素材的文件夹必须保留，不能随名称一起删除",
  );
  assert.equal(fs.existsSync(protectedFolder.folderPath), true);
  assert.throws(
    () => deleteEmptyDesktopNamedFolder({
      desktopDir: tempDesktop,
      folderPath: path.join(tempDesktop, "..", "2026-07-23-不可删除"),
      suffix: "不可删除",
    }),
    /只能操作桌面/,
    "删除接口不能越过桌面根目录",
  );

  const imageFolder = createDesktopDateFolder({
    desktopDir: tempDesktop,
    now: date,
    suffix: "图片约束2",
  });
  for (const fileName of [
    "ChatGPT Image 2026年7月24日 15_35_23 (1).png",
    "ChatGPT Image 2026年7月24日 15_35_24 (2).png",
    "ChatGPT Image 2026年7月24日 16_01_43 (1).png",
    "ChatGPT Image 2026年7月24日 16_01_44 (2).png",
    "ChatGPT Image 2026年7月24日 16_01_45 (3).png",
  ]) {
    fs.writeFileSync(path.join(imageFolder.folderPath, fileName), "image");
  }
  assert.deepEqual(
    listLatestDesktopImageBatch(imageFolder.folderPath).map((item) => item.sequence),
    [1, 2, 3],
    "只应返回最新十秒时间组内从 1 开始的连续图片",
  );
  assert.match(
    listLatestDesktopImageBatch(imageFolder.folderPath)[0].name,
    /16_01_43 \(1\)\.png$/,
  );

  const referenceFolder = createDesktopDateFolder({
    desktopDir: tempDesktop,
    now: date,
    suffix: "按首图匹配",
  });
  for (const fileName of [
    "ChatGPT Image 2026年7月24日 16_01_43 (1).png",
    "ChatGPT Image 2026年7月24日 16_01_44 (3).png",
    "ChatGPT Image 2026年7月24日 16_01_46 (3).png",
    "ChatGPT Image 2026年7月24日 16_01_47 (4).png",
    "ChatGPT Image 2026年7月24日 16_01_45 (2).jpg",
    "ChatGPT Image 2026年7月24日 16_02_10 (1).png",
    "ChatGPT Image 2026年7月24日 16_02_11 (2).png",
  ]) {
    fs.writeFileSync(path.join(referenceFolder.folderPath, fileName), "image");
  }
  const referencedSequence = listDesktopImageSequenceFromReference(
    referenceFolder.folderPath,
    "ChatGPT Image 2026年7月24日 16_01_43 (1).png",
    { maxSequence: 6 },
  );
  assert.deepEqual(
    referencedSequence.map((item) => item.sequence),
    [3, 4],
    "编号2缺失时应留空并继续匹配3、4；不同扩展名和下一轮必须忽略",
  );
  assert.match(
    referencedSequence[0].name,
    /16_01_44 \(3\)\.png$/,
    "同一编号有多个候选时只取距离第一张时间最近的一张",
  );
  assert.throws(
    () => listDesktopImageSequenceFromReference(
      referenceFolder.folderPath,
      "ChatGPT Image 2026年7月24日 16_01_44 (3).png",
    ),
    /必须是编号 \(1\)/,
  );
  assert.equal(
    resolveFolderNameSelection({ names: ["区别"] }),
    "区别",
    "只有一个文件夹名称时应自动选中，避免一键添加按钮看似无响应",
  );
  assert.equal(
    resolveFolderNameSelection({
      names: ["语文", "区别"],
      currentValue: "",
      cachedValue: "区别",
    }),
    "区别",
    "多个名称时应恢复上次选择",
  );
  assert.equal(
    resolveFolderNameSelection({
      names: ["语文", "区别"],
      currentValue: "语文",
      cachedValue: "区别",
    }),
    "语文",
    "当前有效选择应优先于缓存",
  );
  assert.equal(
    resolveFolderNameSelection({
      names: ["语文"],
      cachedValue: "已删除",
    }),
    "语文",
    "缓存名称失效但只剩一个名称时仍应自动选中",
  );
  const linkedServiceRoot = path.join(tempDesktop, "linked-service");
  fs.mkdirSync(path.join(linkedServiceRoot, ".data"), { recursive: true });
  const linkedSource = path.join(imageFolder.folderPath, "ChatGPT Image 2026年7月24日 16_02_01 (1).png");
  fs.writeFileSync(linkedSource, "linked-image");
  const linkedService = createImageService({
    baseDir: linkedServiceRoot,
    getSettings: () => ({}),
  });
  const linkedAsset = linkedService.linkLocalImageAsset({
    filePath: linkedSource,
    sourceType: "ian-xiaohei-local-linked",
    sourceId: "batch:1",
    sceneIndex: 1,
  });
  assert.equal(linkedAsset.file_path, linkedSource);
  assert.equal(linkedAsset.original_path, "");
  assert.equal(linkedAsset.source_type, "ian-xiaohei-local-linked");
  linkedService.deleteAsset(linkedAsset.id);
  assert.equal(fs.existsSync(linkedSource), true, "删除引用记录不能删除桌面原图");
  linkedService.close();

  for (const count of [1, 2, 3]) {
    assert.equal(
      buildMomentsImageInstruction(count),
      `请按提示词生成分镜图片素材，合计 ${count} 张，逐步一张一张地给我，一张都不要少，不要组图或者一张图。`,
    );
  }

  const html = fs.readFileSync(path.join(baseDir, "ui", "index.html"), "utf8");
  assert.match(
    html,
    /data-collector-tab="batch"[\s\S]*id="createDesktopDateFolder"[\s\S]*id="collectorFolderNameSelect"[\s\S]*id="editCollectorFolderName"[\s\S]*id="deleteCollectorFolderName"/,
    "采集处理应提供与小黑页面一致的新建、名称选择、改名和删除控件",
  );
  assert.match(
    html,
    /id="collectorFolderNameSelect"[^>]*data-no-choice-persist/,
    "添加名称选项不能进入通用选择记忆，否则取消后会被恢复并反复弹窗",
  );
  assert.match(
    html,
    /id="copyMomentsPrompts"[\s\S]*id="copyMomentsImageInstruction"/,
    "图片提示词按钮应紧跟复制提示词按钮",
  );

  const runtime = fs.readFileSync(path.join(baseDir, "ui", "modules", "legacy-runtime.js"), "utf8");
  assert.match(runtime, /buildMomentsImageInstruction\(prompts\.length\)/);
  assert.match(runtime, /\/api\/desktop-folder-named/);
  assert.match(runtime, /\/api\/desktop-folder-named\/resolve/);
  assert.match(runtime, /\/api\/desktop-folder-named\/rename/);
  assert.match(runtime, /\/api\/desktop-folder-named\/delete/);
  assert.match(runtime, /setDownloadDir\(data\.folderPath\)/);
  assert.match(runtime, /ian-folder-names-changed/);
  assert.match(runtime, /let collectorFolderPromptActive = false/);
  assert.match(
    runtime,
    /if \(selected === "__new__"\)[\s\S]*collectorFolderNameSelect\.value = ""[\s\S]*promptNewCollectorFolderName\(\)/,
    "采集页打开名称弹窗前必须先退出添加名称选项，防止焦点恢复后重复触发",
  );
  assert.match(runtime, /if \(collectorFolderPromptActive\) return ""/);
  assert.match(runtime, /setTimeout\(\(\) => \{ collectorFolderPromptActive = false; \}, 350\)/);

  const xiaoheiApp = fs.readFileSync(path.join(baseDir, "ui", "modules", "ian-xiaohei-app.js"), "utf8");
  assert.ok(
    xiaoheiApp.indexOf("let folderNames = []") < xiaoheiApp.indexOf("init().catch"),
    "文件夹名称状态必须在异步初始化启动前完成声明",
  );
  assert.match(xiaoheiApp, /Promise\.all\(\[loadConfig\(\), loadAudioJobs\(\), loadFolderNames\(\)\]\)/);
  assert.match(xiaoheiApp, /newOpt\.value = "__new__"/);
  assert.match(xiaoheiApp, /if \(!response\.ok \|\| data\.ok === false\)[\s\S]*throw new Error/);
  assert.match(xiaoheiApp, /\/api\/desktop-folder-named\/rename/);
  assert.match(xiaoheiApp, /\/api\/desktop-folder-named\/delete/);
  assert.match(xiaoheiApp, /ian-folder-names-changed/);
  assert.match(xiaoheiApp, /let folderNamePromptActive = false/);
  assert.match(
    xiaoheiApp,
    /if \(selected === "__new__"\)[\s\S]*els\.folderNameSelect\.value = ""[\s\S]*promptNewFolderName\(\)/,
    "小黑页打开名称弹窗前必须先退出添加名称选项，防止焦点恢复后重复触发",
  );
  assert.match(xiaoheiApp, /if \(folderNamePromptActive\) return ""/);
  assert.match(xiaoheiApp, /setTimeout\(\(\) => \{ folderNamePromptActive = false; \}, 350\)/);
  const addReferenceImages = xiaoheiApp.slice(
    xiaoheiApp.indexOf("async function addLatestFolderImages"),
    xiaoheiApp.indexOf("function shotImageMaterialCount"),
  );
  assert.match(addReferenceImages, /state\.pendingUploads\.get\(1\)/);
  assert.match(addReferenceImages, /state\.folderSequenceReference/);
  assert.match(addReferenceImages, /\/api\/desktop-folder-reference-images/);
  assert.match(addReferenceImages, /state\.pendingUploads\.set\(sequence/);
  assert.match(addReferenceImages, /state\.images\.some/);
  assert.doesNotMatch(addReferenceImages, /desktop-folder-latest-images/);
  assert.doesNotMatch(addReferenceImages, /state\.localMaterialPool\s*=/);
  assert.doesNotMatch(addReferenceImages, /uploadShotImage|bindConfirmedFolderImages|confirmed\s*=/);
  assert.match(
    xiaoheiApp,
    /data-prompt-action="generate-all-images"[\s\S]*data-prompt-action="add-folder-images"[\s\S]*data-prompt-action="bind-folder-images"/,
    "批量操作区应在生成按钮后依次显示添加和绑定素材按钮",
  );
  assert.match(xiaoheiApp, /function shotImageMaterialCount\(/);
  assert.match(xiaoheiApp, /materialBindings:/);

  const server = fs.readFileSync(path.join(baseDir, "ui-server.mjs"), "utf8");
  assert.match(server, /let selectedDownloadsDir = "";/);
  assert.match(server, /downloadsDir:\s*selectedDownloadsDir/);
  assert.match(server, /url\.pathname === "\/api\/files\/download"/);
  assert.match(server, /url\.pathname === "\/api\/folder-names"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-named"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-named\/resolve"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-named\/rename"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-named\/delete"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-latest-images"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-reference-images"/);
  assert.match(server, /url\.pathname === "\/api\/desktop-folder-image"/);
  assert.match(server, /source_type === "ian-xiaohei-local-linked"/);
  assert.match(
    fs.readFileSync(path.join(baseDir, "server", "routes", "ian-xiaohei-routes.js"), "utf8"),
    /route === "bind-local-materials"/,
  );
  assert.match(
    fs.readFileSync(path.join(baseDir, "server", "image", "image-service.js"), "utf8"),
    /function linkLocalImageAsset\(/,
    "本地素材绑定应引用原文件，不能复制或改名",
  );
  assert.doesNotMatch(
    server,
    /settings\.downloadsDir\s*=/,
    "临时下载地址不能写入 settings.json",
  );
} finally {
  fs.rmSync(tempDesktop, { recursive: true, force: true });
}

console.log("workflow conveniences regression test passed");
