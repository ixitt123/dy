const XIAOHEI_HANDOFF_KEY = "video-factory-xiaohei-handoff";

function activeProject() {
  return window.videoProjects?.current?.() || null;
}

function readHandoff() {
  try {
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
  if (!job?.id || job.status !== "completed") {
    throw new Error("请先生成、试听并确认一条 TTS 音频。");
  }
  const handoff = {
    projectId: project?.id || "",
    projectTitle: project?.title || "",
    title: project?.title || job.voice_name || "小黑配图视频",
    text: String(job.text || project?.selectedRewriteText || project?.transcriptText || "").trim(),
    ttsJob: job,
    sentAt: new Date().toISOString(),
  };
  if (!handoff.text) throw new Error("已确认音频缺少对应文案，无法发送到小黑生产线。");
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
      <div class="result-head production-line-head">
        <div>
          <span class="section-eyebrow">PRODUCTION LINE 02</span>
          <h2>小黑视频风格生成</h2>
          <p>使用文案、TTS 音频、参考音频和小黑配图规则，生成逐段配图、音乐素材和剪映草稿。</p>
        </div>
        <button class="ghost" id="refreshXiaoheiProduction" type="button">刷新工作台</button>
      </div>
      <div class="production-line-notice" id="xiaoheiHandoffStatus">可以直接输入文案生成，也可以先在 TTS 语音页确认音频后发送到这里。</div>
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
      : "可以直接输入文案生成，也可以先在 TTS 语音页确认音频后发送到这里。";
    postHandoff(frame, handoff);
  };

  frame.addEventListener("load", refreshStatus);
  refresh.addEventListener("click", () => {
    frame.src = `/xiaohei-illustrations.html?embedded=1&t=${Date.now()}`;
  });
  document.addEventListener("workbench:route", (event) => {
    if (event.detail?.page === "xiaohei-video") refreshStatus();
  });
  window.videoFactorySendToXiaohei = sendConfirmedTtsToXiaohei;
  refreshStatus();
}
