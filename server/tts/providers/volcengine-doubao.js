import { ReservedTtsProvider } from "./reserved-provider.js";

export class VolcengineDoubaoProvider extends ReservedTtsProvider {
  constructor(options = {}) {
    super({ id: "volcengine_doubao", label: "火山引擎豆包语音", stage: "第二阶段", ...options });
  }
}
