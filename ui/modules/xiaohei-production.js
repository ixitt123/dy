let productionReceiver = null;

function activeProject() {
  return window.videoProjects?.current?.() || null;
}

function handoffFromPayload(payload = {}, project = activeProject()) {
  if (!payload?.id) return null;
  const finalText = String(
    payload.final_text
    || payload.metadata?.final_text
    || payload.text
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

function hasUsableTimeline(payload = {}) {
  const rows = Array.isArray(payload.subtitle_timeline) && payload.subtitle_timeline.length
    ? payload.subtitle_timeline
    : Array.isArray(payload.sentence_timeline)
      ? payload.sentence_timeline
      : [];
  return rows.some((row) => String(row?.text || "").trim() && Number(row?.end || 0) > Number(row?.start || 0));
}

function postHandoff(frame, handoff = null) {
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage({ type: "video-factory:xiaohei-handoff", handoff }, window.location.origin);
}

export function sendConfirmedTtsToXiaohei(job, project = activeProject()) {
  if (!job?.id || job.status !== "completed" || String(job.alignment_status || job.metadata?.alignment_status || "") !== "confirmed" || !hasUsableTimeline(job)) {
    productionReceiver?.(null);
    throw new Error("请先生成语音，并检查确认最终文案和字幕时间轴。");
  }
  const handoff = handoffFromPayload(job, project);
  if (!handoff.text) {
    productionReceiver?.(null);
    throw new Error("已确认音频缺少最终识别文案，无法发送到小黑生产线。");
  }
  productionReceiver?.(handoff);
  window.appNavigate?.("xiaohei-video");
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
  let currentHandoff = null;
  let routeActive = false;
  const refreshStatus = () => {
    const handoff = currentHandoff;
    status.textContent = handoff
      ? `已接收音频 #${handoff.ttsJob?.id || "-"}：${handoff.title || "未命名项目"}`
      : "请先在 TTS 语音页确认文案、音频和同步时间戳，再发送到这里。";
    postHandoff(frame, handoff);
  };

  const receiveHandoff = (handoff) => {
    currentHandoff = handoff?.ttsJob?.id && hasUsableTimeline(handoff.ttsJob) ? handoff : null;
    refreshStatus();
    return currentHandoff;
  };

  const receiveTts = (payload = {}) => receiveHandoff(handoffFromPayload(payload));
  productionReceiver = receiveHandoff;
  window.xiaoheiProduction = { receiveHandoff, receiveTts };

  frame.addEventListener("load", refreshStatus);
  refresh.addEventListener("click", () => {
    currentHandoff = null;
    frame.src = `/xiaohei-illustrations.html?embedded=1&t=${Date.now()}`;
    refreshStatus();
  });
  document.addEventListener("workbench:route", (event) => {
    // 切换页面保留生产线状态：不清空 handoff、不重载 iframe，避免已接收的音频资产和工作内容丢失。
    // 只有手动点击"刷新工作台"或从 TTS 页重新发送时才重置。
    routeActive = event.detail?.page === "xiaohei-video";
  });
  window.videoFactorySendToXiaohei = sendConfirmedTtsToXiaohei;
  refreshStatus();
}
