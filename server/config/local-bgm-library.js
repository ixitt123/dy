import os from "node:os";
import path from "node:path";

const desktopDir = path.join(os.homedir(), "Desktop");

export const LOCAL_BGM_LIBRARY_DIRS = [
  {
    id: "advanced-beat-cut-52",
    label: "高级节奏卡点纯音乐 52 首",
    directory: path.join(desktopDir, "高级节奏卡点纯音乐---52首"),
    tags: ["beat", "cut", "rhythm", "卡点", "节奏", "高级感"],
    source: "user_local_bgm_library",
    license: "用户本机 BGM 素材，请确认授权范围后使用",
    license_status: "unknown_review_required",
  },
  {
    id: "premium-vlog-bgm-34",
    label: "高级感十足 Vlog 背景纯音乐 34 首",
    directory: path.join(desktopDir, "【高级感十足】vlog背景纯音乐---34首"),
    tags: ["vlog", "premium", "soft", "高级感", "背景音乐"],
    source: "user_local_bgm_library",
    license: "用户本机 BGM 素材，请确认授权范围后使用",
    license_status: "unknown_review_required",
  },
];
