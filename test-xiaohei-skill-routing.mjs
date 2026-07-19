import assert from "node:assert/strict";
import { PURPOSE_STYLE_PROFILES, buildPrompt } from "./server/routes/ian-xiaohei-routes.js";

const expectedSkillIds = [
  "article",
  "xiaohei-scenes",
  "visual-ip",
  "littlebox",
  "stick-figure",
  "handdrawn-tech",
  "ian-handdrawn-ppt",
  "capybara",
  "wechat",
  "knowledge",
  "workflow",
  "cover-reference",
];

assert.deepEqual(Object.keys(PURPOSE_STYLE_PROFILES), expectedSkillIds);

const requiredProfileFields = [
  "name",
  "intent",
  "actorName",
  "visualDna",
  "characterRule",
  "compositionRule",
  "colorRule",
  "avoid",
];

const visualDnaValues = new Set();
for (const skillId of expectedSkillIds) {
  const profile = PURPOSE_STYLE_PROFILES[skillId];
  for (const field of requiredProfileFields) {
    assert.ok(String(profile[field] || "").trim(), `${skillId}.${field} must be configured`);
  }
  visualDnaValues.add(profile.visualDna);

  const prompt = buildPrompt({
    purpose: skillId,
    topic: "测试主题",
    seriesRole: "1/1 测试镜头",
    structureType: "概念隐喻",
    coreIdea: "测试核心意思",
    sourceText: "这是一段用于验证 Skill 路由的原文。",
    visualSubject: "测试主体",
    xiaoheiAction: "执行测试动作",
    visualMetaphor: "测试隐喻",
    composition: "测试构图",
    elements: ["测试物件"],
    labels: ["测试"],
    aspectRatio: "16:9",
  });

  for (const expected of [
    `SKILL_ID: ${skillId}`,
    "请直接生成一张图片素材。",
    "只生成一张图，不要拼图，不要多宫格，不要组图",
    "保留当前 Skill 允许的少量中文手写标注",
    profile.name,
    profile.visualDna,
    profile.characterRule,
    profile.compositionRule,
    profile.colorRule,
    profile.avoid,
  ]) {
    assert.ok(prompt.includes(expected), `${skillId} prompt is missing: ${expected}`);
  }

  if (skillId !== "article") {
    assert.ok(
      !prompt.includes(PURPOSE_STYLE_PROFILES.article.name),
      `${skillId} prompt must not inherit the article Skill name`,
    );
  }

  assert.doesNotMatch(
    prompt,
    /multi-image set|This image belongs to a multi-image set/u,
    `${skillId} prompt must not contain wording that encourages grouped image generation`,
  );
}

assert.equal(visualDnaValues.size, expectedSkillIds.length, "all 12 Skills need distinct visual DNA");
console.log(`Skill routing verified: ${expectedSkillIds.length} independent profiles.`);
