const XIAOHEI_HANDOFF_KEY = "video-factory-xiaohei-handoff";

function activeProject() {
  return window.videoProjects?.current?.() || null;
}

function handoffFromPayload(payload = {}, project = activeProject()) {
  if (!payload?.id) return null;
  const finalText = String(
    payload.text
    || payload.final_text
    || payload.metadata?.final_text
    || payload.tts_prepared_text
    || payload.metadata?.tts_prepared_text
    || payload.original_text
    || "",
  ).trim();
  return {
    projectId: project?.id || payload.projectId || "",
    projectTitle: project?.title || payload.projectTitle || "",
    title: project?.title || payload.title || payload.voice_name || "小黑配图视频",
    text: finalText,
    ttsJob: {
      ...payload,
      id: payload.id,
      status: "completed",
      final_text: finalText,
      text: finalText,
      alignment_status: payload.alignment_status || "confirmed",
    },
    files: payload.files || [],
    sentAt: new Date().toISOString(),
  };
}

function readHandoff() {
  try {
    const shared = window.sharedTtsHandoff?.read?.();
    if (shared?.id) return handoffFromPayload(shared);
    return JSON.parse(localStorage.getItem(XIAOHEI_HANDOFF_KEY) || "null");
  } catch {
    return null;
  }
}

function postHandoff(frame, handoff = readHandoff()) {
  if (!frame?.contentWindow || !handoff) return;
  frame.contentWindow.postMessage({ type: "video-factory:xiaohei-handoff", handoff }, window.location.origin);
}

export function sendConfirmedTtsToXiaohei(job, project = activeProject()) {
  if (!job?.id || job.status !== "completed" || String(job.alignment_status || job.metadata?.alignment_status || "") !== "confirmed") {
    throw new Error("请先生成语音，并检查确认最终文案和字幕时间轴。");
  }
  const handoff = handoffFromPayload(job, project);
  if (!handoff.text) throw new Error("已确认音频缺少最终识别文案，无法发送到小黑生产线。");
  localStorage.setItem(XIAOHEI_HANDOFF_KEY, JSON.stringify(handoff));
  window.appNavigate?.("xiaohei-video");
  postHandoff(document.querySelector("#xiaoheiProductionFrame"), handoff);
  return handoff;
}

export function initXiaoheiProductionModule() {
  document.querySelectorAll('[data-nav="xiaohei-video"]').forEach((button) => {
    const labelNode = button.querySelector(".nav-index")?.nextElementSibling || button.querySelector("strong");
    if (labelNode) labelNode.textContent = "小黑视频风格生成";
  });

  const page = document.querySelector("#xiaoheiVideoPage");
  if (!page) return;

  page.innerHTML = `
    <section class="embedded-production-line">
      <div class="production-line-toolbar">
        <div class="production-line-notice" id="xiaoheiHandoffStatus">请先在 TTS 语音页确认文案、音频和同步时间戳，再发送到这里。</div>
        <button class="ghost" id="refreshXiaoheiProduction" type="button">刷新工作台</button>
      </div>
      <iframe
        id="xiaoheiProductionFrame"
        class="production-line-frame"
        src="/xiaohei-illustrations.html?embedded=1"
        title="小黑视频风格生成工作台"
      ></iframe>
    </section>`;

  const frame = page.querySelector("#xiaoheiProductionFrame");
  const status = page.querySelector("#xiaoheiHandoffStatus");
  const refresh = page.querySelector("#refreshXiaoheiProduction");
  const refreshStatus = () => {
    const handoff = readHandoff();
    status.textContent = handoff
      ? `已接收音频 #${handoff.ttsJob?.id || "-"}：${handoff.title || "未命名项目"}`
      : "请先在 TTS 语音页确认文案、音频和同步时间戳，再发送到这里。";
    postHandoff(frame, handoff);
  };

  frame.addEventListener("load", refreshStatus);
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type !== "video-factory:xiaohei-shared-timeline-updated" || !event.data.payload?.id) return;
    const payload = window.sharedTtsHandoff?.save?.(event.data.payload, { sourceTarget: "xiaohei-video" }) || event.data.payload;
    const handoff = handoffFromPayload(payload);
    if (handoff) localStorage.setItem(XIAOHEI_HANDOFF_KEY, JSON.stringify(handoff));
    status.textContent = `字幕已自动保存并同步到四条生产线 · 音频 #${payload.id}`;
  });
  refresh.addEventListener("click", () => {
    frame.src = `/xiaohei-illustrations.html?embedded=1&t=${Date.now()}`;
  });
  document.addEventListener("workbench:route", (event) => {
    if (event.detail?.page === "xiaohei-video") refreshStatus();
  });
  window.addEventListener("tts-shared-handoff-updated", (event) => {
    if (event.detail?.sourceTarget === "xiaohei-video") return;
    const handoff = handoffFromPayload(event.detail?.payload);
    if (handoff) localStorage.setItem(XIAOHEI_HANDOFF_KEY, JSON.stringify(handoff));
    refreshStatus();
  });
  window.videoFactorySendToXiaohei = sendConfirmedTtsToXiaohei;
  refreshStatus();
}
