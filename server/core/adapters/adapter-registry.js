/**
 * AdapterRegistry — 适配器注册中心
 * 
 * 设计模式类似 yt-dlp 的 Extractor 注册机制：
 * - register(): 注册适配器
 * - resolve(): 按顺序遍历，找到第一个 canHandle 返回 true 的适配器
 * - extract(): 使用匹配的适配器提取内容
 * 
 * 优先级通过 register 顺序控制（先注册的先匹配）。
 */

import { BaseAdapter } from "./base-adapter.js";

export class AdapterRegistry {
  /** @type {BaseAdapter[]} */
  #adapters = [];

  /**
   * 注册一个适配器实例
   * @param {BaseAdapter} adapter - 适配器实例
   * @param {Object} [options] - 注册选项
   * @param {number} [options.priority] - 优先级 (越小越先匹配，默认追加到末尾)
   * @returns {this}
   */
  register(adapter, options = {}) {
    if (!(adapter instanceof BaseAdapter)) {
      throw new Error(
        `AdapterRegistry.register() requires a BaseAdapter instance, got ${typeof adapter}`
      );
    }
    const entry = { adapter, priority: options.priority ?? 999 };
    this.#adapters.push(entry);
    // 按优先级排序
    this.#adapters.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /**
   * 批量注册适配器
   * @param {BaseAdapter[]} adapters
   * @returns {this}
   */
  registerAll(adapters) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
    return this;
  }

  /**
   * 解析输入，找到第一个能处理的适配器
   * @param {*} input - 输入数据
   * @returns {Promise<BaseAdapter|null>} 匹配的适配器实例，若无则返回 null
   */
  async resolve(input) {
    for (const { adapter } of this.#adapters) {
      try {
        const canHandle = await adapter.canHandle(input);
        if (canHandle) {
          return adapter;
        }
      } catch (err) {
        // 某个适配器的 canHandle 抛出异常时跳过，继续尝试下一个
        continue;
      }
    }
    return null;
  }

  /**
   * 使用匹配的适配器提取内容
   * @param {*} input - 输入数据
   * @returns {Promise<import("./base-adapter.js").RawContentAsset>}
   * @throws {Error} 如果没有适配器能处理该输入
   */
  async extract(input) {
    const adapter = await this.resolve(input);
    if (!adapter) {
      throw new Error(
        `No adapter found to handle input: ${JSON.stringify(input).slice(0, 200)}`
      );
    }
    return adapter.extract(input);
  }

  /**
   * 获取所有已注册的适配器名称
   * @returns {string[]}
   */
  getAdapterNames() {
    return this.#adapters.map(({ adapter }) => adapter.constructor.name);
  }

  /**
   * 获取已注册的适配器数量
   * @returns {number}
   */
  get size() {
    return this.#adapters.length;
  }

  /**
   * 清空所有注册的适配器
   */
  clear() {
    this.#adapters = [];
  }
}
