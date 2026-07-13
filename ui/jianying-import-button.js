(() => {
  const RUNNING = new Set(["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"]);

  function status(message) {
    const el = document.querySelector("#videoProductStatus");
    if (el) el.textContent = message;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || response.statusText || "请求失败");
    return data;
  }

  async function currentProjectId() {
    const selected = document.querySelector("#activeVideoProjectSelect")?.value || "";
    if (selected) return selected;
    const stored = localStorage.getItem("active-video-project-id") || "";
    const data = await requestJson("/api/projects?limit=100");
    const projects = Array.isArray(data.projects) ? data.projects : [];
    if (stored && projects.some((project) => String(project.id) === String(stored))) return stored;
    return projects[0]?.id || "";
  }

  async function ensureProjectId() {
    const existing = await currentProjectId();
    if (existing) return existing;
    const director = document.querySelector("#videoProductDirector");
    const title = director?.selectedOptions?.[0]?.textContent?.replace(/^#\d+\s*/, "").replace(/·.*$/, "").trim()
      || "剪映草稿项目";
    const created = await requestJson("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title,
        videoType: "短视频",
        outputMode: "jianying_template",
      }),
    });
    const projectId = created.project?.id || "";
    if (!projectId) throw new Error("自动创建短视频项目失败。");
    localStorage.setItem("active-video-project-id", projectId);
    const selector = document.querySelector("#activeVideoProjectSelect");
    if (selector) {
      selector.innerHTML = `<option value="${projectId}">${title}</option>`;
      selector.value = projectId;
    }
    status(`已自动创建短视频项目：${title}`);
    return projectId;
  }

  function payload(projectId, { forceExecution = false } = {}) {
    const manualBindings = {};
    document.querySelectorAll(".video-product-image-select").forEach((select) => {
      if (select.value) manualBindings[select.dataset.sceneIndex || ""] = select.value;
    });
    const bgmId = document.querySelector("#videoProductBgm")?.value || "";
    const bgmStrategy = document.querySelector("#videoProductBgmStrategy")?.value || "auto";
    return {
      projectId,
      video_project_id: projectId,
      source_director_project_id: 0,
      audio_asset_id: Number(document.querySelector("#videoProductAudio")?.value || 0),
      image_source: document.querySelector("#videoProductImageSource")?.value || "all",
      output_type: "jianying_template",
      jianying_template: document.querySelector("#videoProductJianyingTemplate")?.value || "education_tips",
      route_a_style_id: document.querySelector("#videoProductRouteAStyle")?.value || "black_gold_knowledge",
      route_a_custom_style: document.querySelector("#videoProductRouteACustomStyle")?.value.trim() || "",
      bgm_strategy: bgmId ? (bgmStrategy || "manual") : bgmStrategy,
      bgm_asset_id: bgmId,
      manual_bindings: manualBindings,
      target_duration: 30,
      force_execution: Boolean(forceExecution),
      force_timeline_blockers: Boolean(forceExecution),
      force_quality_review: Boolean(forceExecution),
    };
  }

  function isForceableError(message = "") {
    return /相似度|随机音频匹配|质量审查未通过|码率偏低|标题仍是内部生产线名称|缺少 BGM 素材/.test(String(message || ""));
  }

  function confirmForce(message = "") {
    return window.confirm(`当前成片检查有风险：\n\n${message}\n\n确定后将强制继续生成剪映草稿，并在报告里保留风险记录。是否继续？`);
  }

  async function waitForProject(id) {
    const start = Date.now();
    while (Date.now() - start < 180000) {
      const data = await requestJson(`/api/video-product/project?id=${encodeURIComponent(id)}`);
      const project = data.project || {};
      if (!RUNNING.has(project.status)) {
        if (project.status === "completed") return project;
        throw new Error(project.error || (project.blockers || []).join("；") || "剪映草稿生成失败");
      }
      status(`${project.current_step || "正在生成剪映草稿"} · ${Number(project.progress || 0)}%`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("剪映草稿生成超时，请查看成片任务列表。");
  }

  async function runImportJianyingDraft({ forceExecution = false } = {}) {
    const projectId = await ensureProjectId();
    const body = payload(projectId, { forceExecution });
    if (!body.audio_asset_id) {
      status("请先选择已完成的 TTS 语音。");
      document.querySelector("#videoProductAudio")?.focus();
      return null;
    }
    status(forceExecution ? "已确认风险，正在强制创建剪映草稿任务..." : "正在创建剪映草稿任务...");
    const created = await requestJson("/api/video-product/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const timelineId = created.project?.project_id || created.project?.id;
    if (!timelineId) throw new Error("后端没有返回成片任务 ID。");
    const project = await waitForProject(timelineId);
    if (!project.draft_path) throw new Error("任务完成了，但没有返回剪映草稿路径。");
    status(`剪映草稿已生成：${project.draft_path}，正在打开剪映...`);
    const opened = await requestJson("/api/video-product/open-jianying", { method: "POST", body: "{}" });
    status(opened.ok
      ? `剪映草稿已导入并请求打开剪映：${project.draft_path}`
      : `剪映草稿已生成：${project.draft_path}；但剪映未打开：${opened.message || "未知原因"}`);
    return project;
  }

  async function importJianyingDraft(event) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    const button = document.querySelector("#generateVideoProduct");
    if (button?.dataset.running === "true") return;
    if (button) {
      button.dataset.running = "true";
      button.disabled = true;
    }
    try {
      await runImportJianyingDraft();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isForceableError(message) && confirmForce(message)) {
        try {
          await runImportJianyingDraft({ forceExecution: true });
        } catch (retryError) {
          status(retryError instanceof Error ? retryError.message : String(retryError));
        }
      } else {
        status(message);
      }
    } finally {
      if (button) {
        button.dataset.running = "false";
        button.disabled = false;
      }
    }
  }

  window.importJianyingDraftNow = importJianyingDraft;
  function bind() {
    const button = document.querySelector("#generateVideoProduct");
    if (!button) return;
    button.addEventListener("click", importJianyingDraft, { capture: true });
  }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
