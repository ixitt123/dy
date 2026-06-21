// 历史兼容导出器：仅用于简单实验、素材包和 capcut-cli 失败后的回退。
import fs from "node:fs";
import path from "node:path";

export function createLegacyJianyingExporter(baseDir) {
  const exportDir = path.join(baseDir, "jianying-exports");
  fs.mkdirSync(exportDir, { recursive: true });

  function exportDraft({ title = "未命名项目", timeline = [], assets = [], outputDir = "" } = {}) {
    const projectDir = outputDir || path.join(exportDir, `draft_${Date.now()}`);
    fs.mkdirSync(projectDir, { recursive: true });

    // 构建 draft_content.json
    const tracks = [];
    const ratio = "9:16";
    const ratioNum = { w: 1080, h: 1920 };

    // 主视频轨道
    const videoTrack = { id: "track_video", type: "video", clips: [] };
    // 音频轨道
    const audioTrack = { id: "track_audio", type: "audio", clips: [] };
    // 字幕轨道（如果有）
    const subtitleTrack = { id: "track_subtitle", type: "subtitle", clips: [] };

    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      const start = videoTrack.clips.reduce((s, c) => s + (c.duration || 0), 0);

      if (item.imagePath || item.videoPath) {
        const assetPath = path.relative(projectDir, item.imagePath || item.videoPath || "");
        const clip = {
          id: `clip_${i}`,
          source: assetPath,
          start,
          duration: item.duration || 3000000, // 默认3秒，单位微秒
          transform: { x: 0, y: 0, scale: 1.0, rotation: 0 },
          crop: { x: 0, y: 0, w: ratioNum.w, h: ratioNum.h },
        };
        videoTrack.clips.push(clip);
      }

      if (item.audioPath) {
        const audioAsset = path.relative(projectDir, item.audioPath || "");
        audioTrack.clips.push({
          id: `audio_${i}`,
          source: audioAsset,
          start,
          duration: item.duration || 3000000,
          volume: 1.0,
          fadeIn: 0,
          fadeOut: 0,
        });
      }

      if (item.subtitle) {
        subtitleTrack.clips.push({
          id: `sub_${i}`,
          text: item.subtitle,
          start,
          duration: item.duration || 3000000,
          style: { fontSize: 48, color: "#FFFFFF", strokeColor: "#000000", strokeWidth: 2 },
        });
      }
    }

    tracks.push(videoTrack);
    if (audioTrack.clips.length > 0) tracks.push(audioTrack);
    if (subtitleTrack.clips.length > 0) tracks.push(subtitleTrack);

    // draft_content.json
    const draftContent = {
      platform: { os: "win" },
      version: "6.0.0",
      name: title,
      trackStoreJson: JSON.stringify(tracks),
      ratio,
      resolution: { w: ratioNum.w, h: ratioNum.h },
      fps: 30,
      duration: videoTrack.clips.reduce((s, c) => s + (c.duration || 0), 0),
    };

    // draft_meta_info.json
    const draftMeta = {
      id: `draft_${Date.now()}`,
      create_time: Date.now(),
      update_time: Date.now(),
      name: title,
      status: "normal",
      version: "6.0.0",
      cover_path: "",
    };

    fs.writeFileSync(path.join(projectDir, "draft_content.json"), JSON.stringify(draftContent, null, 2), "utf8");
    fs.writeFileSync(path.join(projectDir, "draft_meta_info.json"), JSON.stringify(draftMeta, null, 2), "utf8");

    // 复制素材文件
    const copiedAssets = [];
    for (const asset of assets) {
      if (asset.path && fs.existsSync(asset.path)) {
        const dest = path.join(projectDir, path.basename(asset.path));
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(asset.path, dest);
        }
        copiedAssets.push(path.relative(projectDir, dest));
      }
    }

    return {
      mode: "legacy_manual_json",
      warnings: ["此草稿由历史兼容导出器生成，不作为高质量剪映模板主路线。"],
      projectDir,
      files: ["draft_content.json", "draft_meta_info.json", ...copiedAssets],
      draftContent,
      draftMeta,
    };
  }

  function listDrafts() {
    const dirs = fs.readdirSync(exportDir).filter(d => {
      const fullPath = path.join(exportDir, d);
      return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, "draft_content.json"));
    });
    return dirs.map(d => {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(exportDir, d, "draft_meta_info.json"), "utf8"));
        return { id: d, ...meta };
      } catch { return { id: d, name: d }; }
    }).sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
  }

  function deleteDraft(draftId) {
    const draftPath = path.join(exportDir, draftId);
    if (fs.existsSync(draftPath)) {
      fs.rmSync(draftPath, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false, error: "草稿不存在" };
  }

  return { exportDraft, listDrafts, deleteDraft };
}

export const createJianyingExporter = createLegacyJianyingExporter;
