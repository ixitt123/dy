import { initRouter } from "./modules/router.js";
import { initProjectModule } from "./modules/project.js";
import { initCollectorModule } from "./modules/collector.js";
import { initTranscriptModule } from "./modules/transcript.js";
import { initRewriteModule } from "./modules/rewrite.js";
import { initTtsModule } from "./modules/tts.js";
import { initVideoOutputModule } from "./modules/video-output.js";
import { initCs1VideoModule } from "./modules/cs1-video.js";
import { initXiaoheiProductionModule } from "./modules/xiaohei-production.js";
import { initMoneyPrinterTurboModule } from "./modules/moneyprinterturbo.js";
import { initSettingsModule } from "./modules/settings.js";

const modules = [
  initRouter,
  initProjectModule,
  initCollectorModule,
  initTranscriptModule,
  initRewriteModule,
  initTtsModule,
  initVideoOutputModule,
  initCs1VideoModule,
  initXiaoheiProductionModule,
  initMoneyPrinterTurboModule,
  initSettingsModule,
];

async function startApplication() {
  for (const initialize of modules) {
    try {
      await initialize();
    } catch (error) {
      console.error("模块初始化失败", initialize.name || "anonymous", error);
    }
  }
  document.documentElement.dataset.appReady = "true";
}

startApplication().catch((error) => {
  console.error("应用初始化失败", error);
  document.documentElement.dataset.appReady = "error";
});
