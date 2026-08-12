(function exposeMomentsImageInstruction(global) {
  global.buildMomentsImageInstruction = function buildMomentsImageInstruction(count) {
    const total = Number(count);
    if (!Number.isInteger(total) || total < 1) {
      throw new TypeError("配图提示词数量必须是正整数");
    }
    return `请按提示词生成分镜图片素材，合计 ${total} 张，逐步一张一张地给我，一张都不要少，不要组图或者一张图。`;
  };
}(globalThis));
