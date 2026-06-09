import { ReservedTtsProvider } from "./reserved-provider.js";

export class MinimaxProvider extends ReservedTtsProvider {
  constructor(options = {}) {
    super({ id: "minimax", label: "MiniMax", stage: "扩展阶段", ...options });
  }
}
