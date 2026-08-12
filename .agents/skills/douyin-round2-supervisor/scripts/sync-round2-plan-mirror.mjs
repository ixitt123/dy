import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_PLAN_PATH } from "./round2-plan-lib.mjs";
import { option, readCoordination } from "./round2-coordination-lib.mjs";

function stop(message) {
  console.error(`[round2-mirror] FAIL: ${message}`);
  process.exit(1);
}

try {
  const args = process.argv.slice(2);
  const machine = option(args, "--machine").toUpperCase();
  const { policy } = readCoordination(args);
  if (!policy.masterRegisterWriters.includes(machine)) stop("only B may export the authoritative master register");
  const target = path.resolve(option(args, "--target", path.join(os.homedir(), "Desktop", "02-短视频软件第二轮彻底修复执行总表.md")));
  const source = fs.readFileSync(DEFAULT_PLAN_PATH);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, source);
  fs.renameSync(temporary, target);
  const digest = crypto.createHash("sha256").update(source).digest("hex");
  console.log(`[round2-mirror] OK: ${target}`);
  console.log(`[round2-mirror] sha256=${digest}`);
} catch (error) {
  stop(error.message);
}
