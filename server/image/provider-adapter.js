// Image Provider 统一接口
export class ImageProviderAdapter {
  constructor(options = {}) {
    this.name = "base";
    this.config = options.config || {};
  }

  async generateImage({ prompt, aspectRatio, outputPath }) {
    throw new Error(`Provider ${this.name} 未实现 generateImage`);
  }

  async validateConfig() {
    return { valid: false, error: `${this.name} 未实现 validateConfig` };
  }
}

export async function callProviderGenerate(provider, params) {
  const start = Date.now();
  try {
    const result = await provider.generateImage(params);
    return { success: true, provider: provider.name, ...result, duration: Date.now() - start };
  } catch (error) {
    return { success: false, provider: provider.name, error: error.message, duration: Date.now() - start };
  }
}
