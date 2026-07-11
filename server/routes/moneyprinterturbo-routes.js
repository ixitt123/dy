import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { readJsonBody } from "../utils/http-body.js";

function waitForExit(child) {
  return new Promise((resolve) => child.once("close", (code) => resolve(code)));
}

export function createMoneyPrinterTurboRoutes({ baseDir, sendJson, getSettings, writeSettings }) {
  const defaultInstallDir = path.join(baseDir, "integrations", "moneyprinterturbo");
  let childProcess = null;

  function config() {
    const current = getSettings()?.moneyPrinterTurbo || {};
    return {
      installDir: path.resolve(current.installDir || defaultInstallDir),
      serviceUrl: String(current.serviceUrl || "http://127.0.0.1:8501").replace(/\/$/, ""),
    };
  }

  async function isOnline(serviceUrl) {
    try {
      const response = await fetch(serviceUrl, { signal: AbortSignal.timeout(1800) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function status() {
    const current = config();
    const installed = fs.existsSync(path.join(current.installDir, "webui.bat"));
    const online = await isOnline(current.serviceUrl);
    return {
      ok: true,
      installed,
      online,
      running: Boolean(childProcess && childProcess.exitCode === null),
      installDir: current.installDir,
      serviceUrl: current.serviceUrl,
      message: !installed ? "未检测到官方源码。" : online ? "MoneyPrinterTurbo 已就绪。" : "源码已安装，服务尚未启动。",
    };
  }

  return async function handleMoneyPrinterTurboRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/moneyprinterturbo")) return false;

    if (req.method === "GET" && url.pathname === "/api/moneyprinterturbo/status") {
      sendJson(res, 200, await status());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/settings") {
      const body = await readJsonBody(req);
      const current = getSettings();
      current.moneyPrinterTurbo = {
        installDir: path.resolve(String(body.installDir || defaultInstallDir)),
        serviceUrl: String(body.serviceUrl || "http://127.0.0.1:8501").replace(/\/$/, ""),
      };
      writeSettings(current);
      sendJson(res, 200, await status());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/start") {
      const current = config();
      const launcher = path.join(current.installDir, "webui.bat");
      if (!fs.existsSync(launcher)) {
        sendJson(res, 404, { ok: false, message: "未找到 MoneyPrinterTurbo/webui.bat。" });
        return true;
      }
      const example = path.join(current.installDir, "config.example.toml");
      const target = path.join(current.installDir, "config.toml");
      if (!fs.existsSync(target) && fs.existsSync(example)) fs.copyFileSync(example, target);
      if (!childProcess || childProcess.exitCode !== null) {
        childProcess = spawn("cmd.exe", ["/d", "/s", "/c", launcher], {
          cwd: current.installDir,
          windowsHide: true,
          detached: false,
          stdio: "ignore",
        });
        childProcess.once("error", () => { childProcess = null; });
      }
      sendJson(res, 202, { ok: true, message: "MoneyPrinterTurbo 正在后台启动。", ...(await status()) });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/stop") {
      if (childProcess && childProcess.exitCode === null) childProcess.kill();
      childProcess = null;
      sendJson(res, 200, { ok: true, message: "MoneyPrinterTurbo 已停止。" });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/update") {
      const current = config();
      if (!fs.existsSync(path.join(current.installDir, ".git"))) {
        sendJson(res, 400, { ok: false, message: "当前目录不是可更新的官方 Git 源码。" });
        return true;
      }
      const child = spawn("git", ["pull", "--ff-only", "origin", "main"], {
        cwd: current.installDir,
        windowsHide: true,
        stdio: "ignore",
      });
      const code = await waitForExit(child);
      sendJson(res, code === 0 ? 200 : 500, {
        ok: code === 0,
        message: code === 0 ? "MoneyPrinterTurbo 已更新。" : "更新失败，请检查网络和上游分支。",
      });
      return true;
    }

    return false;
  };
}
