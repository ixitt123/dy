import { ReservedTtsProvider } from "./reserved-provider.js";

export class ElevenLabsProvider extends ReservedTtsProvider {
  constructor(options = {}) {
    super({ id: "elevenlabs", label: "ElevenLabs", stage: "扩展阶段", ...options });
  }
}
