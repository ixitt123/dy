import { postJson } from "./api.js";

const EXAMPLE_TEXT = "看着明天仪征几千名初三学生奔赴考场，新初二、新初三的家长们，你们以为中考离你们还远吗？别等初三，现在就开始查短板、定节奏。";

export function initCs1VideoModule() {
  const form = document.getElementById("cs1VideoForm");
  if (!form) return;

  const titleInput = document.getElementById("cs1VideoTitle");
  const textInput = document.getElementById("cs1VideoText");
  const aiInput = document.getElementById("cs1VideoAiRefine");
  const status = document.getElementById("cs1VideoStatus");
  const message = document.getElementById("cs1VideoMessage");
  const resultPanel = document.getElementById("cs1VideoResult");
  const outputPath = document.getElementById("cs1VideoOutputPath");
  const logPanel = document.getElementById("cs1VideoLog");
  const generateButton = document.getElementById("cs1VideoGenerate");
  const exampleButton = document.getElementById("cs1VideoExample");
  const openFileButton = document.getElementById("cs1VideoOpenFile");
  const openProjectButton = document.getElementById("cs1VideoOpenProject");
  const openOutputButton = document.getElementById("cs1VideoOpenOutput");
  let lastResult = null;

  const setStatus = (value, detail = "") => {
    status.textContent = value;
    message.textContent = detail;
  };

  const selectedStyle = () => form.querySelector('input[name="cs1VideoStyle"]:checked')?.value || "cs1";

  form.querySelectorAll(".cs1-style-card").forEach((card) => {
    card.addEventListener("click", () => {
      form.querySelectorAll(".cs1-style-card").forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
    });
  });

  exampleButton?.addEventListener("click", () => {
    titleInput.value = "仪征中考家长提醒";
    textInput.value = EXAMPLE_TEXT;
    textInput.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resultPanel.hidden = true;
    logPanel.textContent = "";
    generateButton.disabled = true;
    setStatus("正在生成", "正在创建 HyperFrames 工程、检查布局并渲染 MP4，通常需要 30-90 秒。");
    try {
      const result = await postJson("/api/cs1-video/generate", {
        title: titleInput.value,
        text: textInput.value,
        style: selectedStyle(),
        aiRefine: aiInput.checked,
      });
      lastResult = result;
      outputPath.textContent = result.outputPath || "";
      logPanel.textContent = [
        result.aiUsed ? "AI beat refinement: used" : "AI beat refinement: local fallback",
        "",
        result.checkLog || "",
        "",
        result.renderLog || "",
      ].join("\n").trim();
      resultPanel.hidden = false;
      setStatus("生成完成", `模板：${result.style === "warmgrain" ? "Warm Grain" : "CS1"}。视频已输出到本机。`);
    } catch (error) {
      setStatus("生成失败", error instanceof Error ? error.message : String(error));
      logPanel.textContent = error instanceof Error ? error.stack || error.message : String(error);
    } finally {
      generateButton.disabled = false;
    }
  });

  openFileButton?.addEventListener("click", () => {
    if (lastResult?.outputPath) openPath(lastResult.outputPath);
  });
  openProjectButton?.addEventListener("click", () => {
    if (lastResult?.projectDir) openPath(lastResult.projectDir);
  });
  openOutputButton?.addEventListener("click", () => {
    if (lastResult?.outputPath) {
      openPath(lastResult.outputPath);
    } else {
      setStatus("还没有输出", "先生成一个视频，完成后可以直接打开输出位置。");
    }
  });
}

async function openPath(filePath) {
  await postJson("/api/open-path", { filePath });
}
