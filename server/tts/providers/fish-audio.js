import { ReservedTtsProvider } from "./reserved-provider.js";

export class FishAudioProvider extends ReservedTtsProvider {
  constructor(options = {}) {
    super({ id: "fish_audio", label: "Fish Audio", stage: "扩展阶段", ...options });
  }
}
