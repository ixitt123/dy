import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const TARGETS = new Set(["cs1-video", "xiaohei-video", "money-printer", "kinetic-text"]);
const RECEIPT_STATES = ["sent", "received", "staged", "rendered", "verified"];

function normalizeTargets(targets = []) {
  return [...new Set((Array.isArray(targets) ? targets : [targets]).map(String).filter((target) => TARGETS.has(target)))];
}

function decode(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    revision: String(row.revision),
    jobId: String(row.job_id),
    targets: JSON.parse(row.targets_json || "[]"),
    payload: JSON.parse(row.payload_json || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeReceipt(row) {
  if (!row) return null;
  return {
    handoffId: String(row.handoff_id),
    revision: String(row.revision),
    target: String(row.target),
    state: String(row.state),
    assetId: String(row.asset_id || ""),
    timeline: JSON.parse(row.timeline_json || "[]"),
    updatedAt: row.updated_at,
  };
}

export function createTtsHandoffService(baseDir, options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(baseDir, ".data", "tts"));
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "handoffs.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tts_handoffs (
      id TEXT PRIMARY KEY,
      revision TEXT NOT NULL,
      job_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      targets_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tts_handoffs_job_revision
      ON tts_handoffs(job_id, revision);
    CREATE TABLE IF NOT EXISTS tts_handoff_receipts (
      handoff_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      target TEXT NOT NULL,
      state TEXT NOT NULL,
      asset_id TEXT NOT NULL DEFAULT '',
      timeline_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (handoff_id, target),
      FOREIGN KEY (handoff_id) REFERENCES tts_handoffs(id) ON DELETE CASCADE
    );
  `);

  function withImmediateTransaction(operation) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function get(id) {
    const handoffId = String(id || "").trim();
    if (!handoffId) return null;
    return decode(db.prepare("SELECT * FROM tts_handoffs WHERE id=?").get(handoffId));
  }

  function save(payload = {}, targets = []) {
    const handoffId = String(payload.handoff_id || "").trim();
    const revision = String(payload.handoff_revision || "").trim();
    const jobId = String(payload.id || "").trim();
    const targetList = normalizeTargets(targets);
    if (!handoffId || !revision || !jobId) throw new Error("handoff ID、revision 和 TTS job ID 不能为空。");
    if (!targetList.length) throw new Error("至少选择一条有效生产线。");
    const payloadJson = JSON.stringify(payload);
    const targetsJson = JSON.stringify(targetList);
    return withImmediateTransaction(() => {
      const existing = get(handoffId);
      if (existing) {
        if (existing.revision !== revision || JSON.stringify(existing.payload) !== payloadJson) {
          throw new Error(`handoff ${handoffId} 已存在且内容不一致，禁止覆盖。`);
        }
        const mergedTargets = normalizeTargets([...existing.targets, ...targetList]);
        if (mergedTargets.length !== existing.targets.length) {
          db.prepare("UPDATE tts_handoffs SET targets_json=?, updated_at=? WHERE id=?")
            .run(JSON.stringify(mergedTargets), new Date().toISOString(), handoffId);
        }
        const now = new Date().toISOString();
        for (const target of targetList) {
          db.prepare(`INSERT OR IGNORE INTO tts_handoff_receipts
            (handoff_id, revision, target, state, asset_id, timeline_json, updated_at)
            VALUES (?, ?, ?, 'sent', '', ?, ?)`)
            .run(handoffId, revision, target, JSON.stringify([{ state: "sent", at: now }]), now);
        }
        return get(handoffId);
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO tts_handoffs (id, revision, job_id, payload_json, targets_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(handoffId, revision, jobId, payloadJson, targetsJson, now, now);
      for (const target of targetList) {
        db.prepare(`INSERT INTO tts_handoff_receipts
          (handoff_id, revision, target, state, asset_id, timeline_json, updated_at)
          VALUES (?, ?, ?, 'sent', '', ?, ?)`)
          .run(handoffId, revision, target, JSON.stringify([{ state: "sent", at: now }]), now);
      }
      return get(handoffId);
    });
  }

  function listReceipts(handoffId) {
    const id = String(handoffId || "").trim();
    if (!id) return [];
    return db.prepare("SELECT * FROM tts_handoff_receipts WHERE handoff_id=? ORDER BY target")
      .all(id).map(decodeReceipt);
  }

  function updateReceipt(input = {}) {
    const handoffId = String(input.handoffId || input.handoff_id || "").trim();
    const target = String(input.target || "").trim();
    const nextState = String(input.state || "").trim();
    const assetId = String(input.assetId || input.asset_id || "").trim();
    if (!handoffId || !TARGETS.has(target) || !RECEIPT_STATES.includes(nextState)) throw new Error("receipt 参数无效。");
    const receipt = decodeReceipt(db.prepare("SELECT * FROM tts_handoff_receipts WHERE handoff_id=? AND target=?").get(handoffId, target));
    if (!receipt) throw new Error("receipt 不存在或目标不属于本次 handoff。");
    const currentIndex = RECEIPT_STATES.indexOf(receipt.state);
    const nextIndex = RECEIPT_STATES.indexOf(nextState);
    if (nextIndex < currentIndex) throw new Error(`receipt 不能从 ${receipt.state} 回退到 ${nextState}。`);
    if (nextIndex > currentIndex + 1) throw new Error(`receipt 不能跳过状态：${receipt.state} -> ${nextState}。`);
    if (["rendered", "verified"].includes(nextState) && !assetId && !receipt.assetId) throw new Error(`${nextState} 状态必须提供最终 assetId。`);
    if (nextIndex === currentIndex) {
      if (assetId && receipt.assetId && assetId !== receipt.assetId) throw new Error("相同 receipt 状态不能更换 assetId。");
      return receipt;
    }
    const now = new Date().toISOString();
    const timeline = [...receipt.timeline, { state: nextState, at: now, ...(assetId ? { assetId } : {}) }];
    db.prepare(`UPDATE tts_handoff_receipts SET state=?, asset_id=?, timeline_json=?, updated_at=?
      WHERE handoff_id=? AND target=?`)
      .run(nextState, assetId || receipt.assetId, JSON.stringify(timeline), now, handoffId, target);
    return decodeReceipt(db.prepare("SELECT * FROM tts_handoff_receipts WHERE handoff_id=? AND target=?").get(handoffId, target));
  }

  return { dbPath, save, get, listReceipts, updateReceipt, close: () => db.close() };
}
