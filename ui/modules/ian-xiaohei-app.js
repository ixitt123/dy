const state = {
  plan: null,
  outputDir: "",
  promptsText: "",
};

const els = {
  titleInput: document.querySelector("#titleInput"),
  copyInput: document.querySelector("#copyInput"),
  countSelect: document.querySelector("#countSelect"),
  purposeSelect: document.querySelector("#purposeSelect"),
  structureSelect: document.querySelector("#structureSelect"),
  generateImages: document.querySelector("#generateImages"),
  planPrompts: document.querySelector("#planPrompts"),
  copyPrompts: document.querySelector("#copyPrompts"),
  openOutputDir: document.querySelector("#openOutputDir"),
  refreshOutputs: document.querySelector("#refreshOutputs"),
  statusLabel: document.querySelector("#statusLabel"),
  statusDetail: document.querySelector("#statusDetail"),
  progressStep: document.querySelector("#progressStep"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  promptResults: document.querySelector("#promptResults"),
  imageResults: document.querySelector("#imageResults"),
  outputHistory: document.querySelector("#outputHistory"),
  outputDirLabel: document.querySelector("#outputDirLabel"),
  planCount: document.querySelector("#planCount"),
  imageCount: document.querySelector("#imageCount"),
};

init().catch((error) => setStatus("初始化失败", error.message || String(error), 0, true));

async function init() {
  bindEvents();
  await loadConfig();
  await loadOutputs();
}

function bindEvents() {
  els.planPrompts.addEventListener("click", () => createPlan());
  els.generateImages.addEventListener("click", () => generateImages());
  els.copyPrompts.addEventListener("click", () => copyAllPrompts());
  els.openOutputDir.addEventListener("click", () => openOutputDir());
  els.refreshOutputs.addEventListener("click", () => loadOutputs());
}

async function loadConfig() {
  const data = await fetchJson("/api/ian-xiaohei/config");
  state.outputDir = data.outputDir || "";
  els.outputDirLabel.textContent = state.outputDir;
  els.purposeSelect.innerHTML = (data.purposes || [])
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  els.structureSelect.insertAdjacentHTML("beforeend", (data.structureTypes || [])
    .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    .join(""));
}

async function createPlan() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要配图的中文文案。", 0, true);
    return null;
  }
  setBusy(true);
  setStatus("正在生成提示词", "根据文案拆分认知锚点，并套用小黑正文配图规则。", 35, false, "分析文案");
  try {
    const data = await requestPlan(payload);
    state.plan = data;
    renderPlan(data);
    setStatus("提示词已生成", `共 ${data.shots?.length || 0} 张，画幅固定为 16:9。`, 100, false, "提示词完成");
    return data;
  } catch (error) {
    setStatus("提示词生成失败", error.message || String(error), 0, true);
    return null;
  } finally {
    setBusy(false);
  }
}

async function generateImages() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要配图的中文文案。", 0, true);
    return;
  }
  setBusy(true);
  setStatus("正在生成小黑配图", "正在生成配图计划。", 5, false, "0/0");
  els.imageResults.className = "image-list empty";
  els.imageResults.textContent = "生成中，请稍候。";
  try {
    const plan = await requestPlan(payload);
    state.plan = plan;
    renderPlan(plan);
    const shots = plan.shots || [];
    const images = [];
    const errors = [];
    renderImages(images, errors);
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index];
      const before = progressForShot(index, shots.length);
      setStatus(
        "正在生成小黑配图",
        `第 ${index + 1}/${shots.length} 张：${shot.topic || "小黑配图"}`,
        before,
        false,
        `${index}/${shots.length}`,
      );
      try {
        const data = await fetchJson("/api/ian-xiaohei/generate-shot", {
          method: "POST",
          body: JSON.stringify({
            batchId: plan.batchId,
            plan,
            shot,
          }),
        });
        images.push(data.image);
      } catch (error) {
        errors.push({
          index: shot.index,
          topic: shot.topic,
          message: error.payload?.message || error.message || String(error),
        });
      }
      renderImages(images, errors);
      setStatus(
        "正在生成小黑配图",
        `已完成 ${index + 1}/${shots.length} 张。`,
        progressForShot(index + 1, shots.length),
        false,
        `${index + 1}/${shots.length}`,
      );
    }
    await loadOutputs();
    if (!images.length && errors.length) {
      setStatus("生成失败", errors[0].message || "图片生成失败。", 100, true, `${errors.length}/${shots.length} 失败`);
      return;
    }
    const summary = errors.length ? `成功 ${images.length} 张，失败 ${errors.length} 张。` : `成功 ${images.length} 张。`;
    setStatus("生成完成", `${summary} 已保存到本地输出目录。`, 100, false, `${images.length}/${shots.length}`);
  } catch (error) {
    const detail = error.payload?.message || error.message || String(error);
    const plan = error.payload?.plan;
    if (plan) renderPlan(plan);
    renderImages(error.payload?.images || [], error.payload?.errors || [{ message: detail }]);
    setStatus("生成失败", detail, 100, true);
  } finally {
    setBusy(false);
  }
}

async function requestPlan(payload) {
  return fetchJson("/api/ian-xiaohei/plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function loadOutputs() {
  const data = await fetchJson("/api/ian-xiaohei/outputs");
  state.outputDir = data.outputDir || state.outputDir;
  els.outputDirLabel.textContent = state.outputDir;
  renderHistory(data.batches || []);
}

async function openOutputDir() {
  await fetchJson("/api/ian-xiaohei/open-output", { method: "POST", body: "{}" });
}

function formPayload() {
  return {
    title: els.titleInput.value.trim(),
    text: els.copyInput.value.trim(),
    count: Number(els.countSelect.value) || 1,
    purpose: els.purposeSelect.value || "article",
    structureType: els.structureSelect.value || "",
  };
}

function renderPlan(plan) {
  const shots = plan?.shots || [];
  els.planCount.textContent = String(shots.length);
  state.promptsText = shots.map((shot) => `#${shot.index} ${shot.topic}\n${shot.prompt}`).join("\n\n---\n\n");
  if (!shots.length) {
    els.promptResults.className = "prompt-list empty";
    els.promptResults.textContent = "还没有生成提示词。";
    return;
  }
  els.promptResults.className = "prompt-list";
  els.promptResults.innerHTML = shots.map((shot) => `
    <article class="prompt-card">
      <h3>#${shot.index} ${escapeHtml(shot.topic)}</h3>
      <p class="meta">${escapeHtml(shot.purpose)} · ${escapeHtml(shot.role || "自动角色")} · ${escapeHtml(shot.structureType)}</p>
      <pre>${escapeHtml(shot.prompt)}</pre>
    </article>
  `).join("");
}

function renderImages(images, errors = []) {
  els.imageCount.textContent = String(images.length);
  if (!images.length && !errors.length) {
    els.imageResults.className = "image-list empty";
    els.imageResults.textContent = "生成后的图片会显示在这里。";
    return;
  }
  els.imageResults.className = "image-list";
  const imageHtml = images.map((image) => `
    <article class="image-card">
      <img src="${escapeAttr(image.imageUrl || image.thumbnailUrl || "")}" alt="${escapeAttr(image.topic || "小黑配图")}" />
      <h3>#${image.index} ${escapeHtml(image.topic || "小黑配图")}</h3>
      <p class="meta">${escapeHtml(image.purpose || "")}</p>
      <p class="path">${escapeHtml(image.imagePath || "")}</p>
    </article>
  `).join("");
  const errorHtml = errors.map((error) => `
    <article class="image-card">
      <h3 class="error">#${escapeHtml(error.index || "-")} 生成失败</h3>
      <p>${escapeHtml(error.topic || "")}</p>
      <p class="error">${escapeHtml(error.message || "未知错误")}</p>
    </article>
  `).join("");
  els.imageResults.innerHTML = imageHtml + errorHtml;
}

function renderHistory(batches) {
  if (!batches.length) {
    els.outputHistory.className = "history-list empty";
    els.outputHistory.textContent = "暂无历史输出。";
    return;
  }
  els.outputHistory.className = "history-list";
  els.outputHistory.innerHTML = batches.map((batch) => `
    <article class="history-card">
      <h3>${escapeHtml(batch.id)}</h3>
      <p class="meta">${escapeHtml(batch.files?.length || 0)} 张 · ${escapeHtml(batch.folderPath || "")}</p>
      <div class="history-images">
        ${(batch.files || []).slice(0, 4).map((file) => `
          <img src="${escapeAttr(file.imageUrl)}" alt="${escapeAttr(file.name)}" />
          <p class="path">${escapeHtml(file.path)}</p>
        `).join("")}
      </div>
    </article>
  `).join("");
}

async function copyAllPrompts() {
  if (!state.promptsText) {
    await createPlan();
  }
  if (!state.promptsText) return;
  await navigator.clipboard.writeText(state.promptsText);
  setStatus("已复制提示词", "可以直接粘贴到 ChatGPT 网页或图片生成工具。", 100);
}

function setBusy(busy) {
  els.generateImages.disabled = busy;
  els.planPrompts.disabled = busy;
  els.copyPrompts.disabled = busy;
}

function progressForShot(done, total) {
  if (!total) return 0;
  return Math.round(8 + (Math.max(0, Math.min(done, total)) / total) * 90);
}

function setStatus(label, detail, progress = 0, isError = false, step = "") {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  els.statusLabel.textContent = label;
  els.statusLabel.className = isError ? "error" : safeProgress >= 100 ? "success" : "";
  els.statusDetail.textContent = detail || "";
  els.progressStep.textContent = step || (safeProgress >= 100 ? "完成" : "处理中");
  els.progressPercent.textContent = `${safeProgress}%`;
  els.progressBar.style.width = `${safeProgress}%`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || `请求失败 ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
