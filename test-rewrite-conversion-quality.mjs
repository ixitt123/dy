import assert from "node:assert/strict";
import {
  conversionStructureEvidenceIsGrounded,
  parentConversionLocalQuality,
  reviewIssuesAreOnlyParentAdvisory,
} from "./server/core/rewrite-conversion-quality.js";

const sourceText = "很多家长以为补课越多越好，但真正决定孩子后劲的是独立解决问题的能力。";
const content = "补课越多，孩子以后就一定更有后劲吗？很多家长只看眼前学会了多少，却忽略孩子是否一直依赖别人带着分析。真正拉开差距的，是离开老师后还能不能自己发现问题、解决问题。别只替孩子解决眼前不会的题，要把独立学习的能力还给他。留言或私信说说孩子目前卡在哪里，我们一起分析。";
const structure = {
  hook: "补课越多，孩子以后就一定更有后劲吗？",
  painConflict: "很多家长只看眼前学会了多少，却忽略孩子是否一直依赖别人带着分析。",
  turn: "真正拉开差距的，是离开老师后还能不能自己发现问题、解决问题。",
  climax: "别只替孩子解决眼前不会的题，要把独立学习的能力还给他。",
  ending: "留言或私信说说孩子目前卡在哪里，我们一起分析。",
};

assert.equal(conversionStructureEvidenceIsGrounded(content, structure), true);
assert.equal(parentConversionLocalQuality({
  content,
  conversionStructure: structure,
  ctaMode: "action",
  sourceText,
}).pass, true);

assert.equal(reviewIssuesAreOnlyParentAdvisory([
  "hook为空泛口号，未具体化",
  "climax未回到孩子与家长的真实选择或代价",
  "cta_mode=action但未明确邀请咨询，且可能隐含虚构服务",
]), true);
assert.equal(reviewIssuesAreOnlyParentAdvisory(["正文编造了试听课程"]), false);

const missingCta = parentConversionLocalQuality({
  content: content.replace("留言或私信说说孩子目前卡在哪里，我们一起分析。", "家长一定要明白。"),
  conversionStructure: {
    ...structure,
    ending: "家长一定要明白。",
  },
  ctaMode: "consult",
  sourceText,
});
assert.equal(missingCta.pass, false);
assert.match(missingCta.issues.join("；"), /下一步行动/u);

const inventedCourse = parentConversionLocalQuality({
  content: `${content} 现在报名课程还有优惠名额。`,
  conversionStructure: structure,
  ctaMode: "action",
  sourceText,
});
assert.equal(inventedCourse.pass, false);
assert.deepEqual(inventedCourse.inventedTerms, ["课程", "名额", "优惠", "报名"]);

assert.equal(conversionStructureEvidenceIsGrounded(content, {
  ...structure,
  climax: "正文里不存在的高潮证据",
}), false);

const contextualClimaxContent = "孩子背单词总是今天记住、明天忘，真不一定是不努力。家长只催他反复抄写，往往越抄越烦。先建立认读词汇量，再训练听读和默写。方法和顺序不对，再努力也容易原地打转。留言说说孩子目前卡在哪里，我们一起分析。";
const contextualClimaxStructure = {
  hook: "孩子背单词总是今天记住、明天忘，真不一定是不努力。",
  painConflict: "家长只催他反复抄写，往往越抄越烦。",
  turn: "先建立认读词汇量，再训练听读和默写。",
  climax: "方法和顺序不对，再努力也容易原地打转。",
  ending: "留言说说孩子目前卡在哪里，我们一起分析。",
};
assert.equal(conversionStructureEvidenceIsGrounded(contextualClimaxContent, contextualClimaxStructure), true);
assert.equal(parentConversionLocalQuality({
  content: contextualClimaxContent,
  conversionStructure: contextualClimaxStructure,
  ctaMode: "action",
  sourceText: "孩子背单词总是今天记住、明天忘。先建立认读词汇量，再训练听读和默写。",
}).pass, true, "高潮由相邻句共同表达时，不应只因单句缺少固定关键词而丢弃整篇好文案");

console.log("Rewrite conversion quality: OK");
