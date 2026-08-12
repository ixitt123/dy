const REQUIRED_STRUCTURE_KEYS = ["hook", "painConflict", "turn", "climax", "ending"];
const SAFE_CTA_PATTERN = /留言|私信|评论区|咨询|聊聊|说说|告诉我|联系我|沟通|交流|一起想|一起看看|具体情况|孩子情况/u;
const CLIMAX_PATTERN = /孩子|家长|自己|以后|未来|长期|决定|真正|依赖|独立|选择|代价|继续|离开|能不能|缺一步|白费|卡|后劲|能力/u;
const FORBIDDEN_INVENTION_TERMS = [
  "课程",
  "试听",
  "名额",
  "优惠",
  "报名",
  "校区",
  "收费",
  "价格",
  "提分",
  "保分",
  "包过",
  "录取",
  "服务",
];
const ADVISORY_ISSUE_PATTERNS = [
  /(?:hook|钩子).*(?:空泛|未具体|不够具体)/iu,
  /(?:climax|高潮).*(?:未回到|不够具体|未体现)/iu,
  /(?:ending|结尾).*(?:缺少|未明确).*(?:留言|私信|引导|行动)/iu,
  /(?:cta_mode|行动号召|cta).*(?:未明确|缺少|可能隐含|不合格)/iu,
];

export function compactRewriteEvidence(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

export function conversionStructureEvidenceIsGrounded(content, structure = {}) {
  const compactContent = compactRewriteEvidence(content);
  if (!compactContent) return false;
  return REQUIRED_STRUCTURE_KEYS.every((key) => {
    const evidence = compactRewriteEvidence(structure?.[key]);
    return evidence.length >= 4 && compactContent.includes(evidence);
  });
}

function groundedEvidenceContext(content, evidence, nextEvidence = "", radius = 72) {
  const text = String(content || "");
  const phrase = String(evidence || "").trim();
  if (!text || !phrase) return phrase;
  const index = text.indexOf(phrase);
  if (index < 0) return phrase;
  const nextPhrase = String(nextEvidence || "").trim();
  const nextIndex = nextPhrase ? text.indexOf(nextPhrase, index + phrase.length) : -1;
  const endBoundary = nextIndex >= 0 ? nextIndex : text.length;
  return text.slice(
    Math.max(0, index - radius),
    Math.min(endBoundary, index + phrase.length + radius),
  );
}

export function parentConversionLocalQuality({
  content,
  conversionStructure = {},
  ctaMode = "",
  sourceText = "",
} = {}) {
  const issues = [];
  const compactHook = compactRewriteEvidence(conversionStructure.hook);
  const compactClimax = compactRewriteEvidence(conversionStructure.climax);
  const climaxContext = groundedEvidenceContext(
    content,
    conversionStructure.climax,
    conversionStructure.ending,
  );
  const endingWindow = `${conversionStructure.ending || ""}\n${String(content || "").slice(-140)}`;

  if (!conversionStructureEvidenceIsGrounded(content, conversionStructure)) {
    issues.push("结构证据没有全部出现在正文中");
  }
  if (compactHook.length < 8) {
    issues.push("钩子不够具体");
  }
  if (compactClimax.length < 6 || !CLIMAX_PATTERN.test(climaxContext)) {
    issues.push("高潮没有体现孩子或家长的选择、能力或长期代价");
  }
  if ((ctaMode === "consult" || ctaMode === "action") && !SAFE_CTA_PATTERN.test(endingWindow)) {
    issues.push("结尾缺少明确且合规的下一步行动");
  }

  const compactContent = compactRewriteEvidence(content);
  const compactSource = compactRewriteEvidence(sourceText);
  const inventedTerms = FORBIDDEN_INVENTION_TERMS.filter((term) => (
    compactContent.includes(compactRewriteEvidence(term))
    && !compactSource.includes(compactRewriteEvidence(term))
  ));
  if (inventedTerms.length) {
    issues.push(`正文新增了原文没有的营销事实：${inventedTerms.join("、")}`);
  }

  return {
    pass: issues.length === 0,
    issues,
    inventedTerms,
  };
}

export function reviewIssuesAreOnlyParentAdvisory(issues = []) {
  const rows = Array.isArray(issues)
    ? issues.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return rows.length > 0 && rows.every((issue) => ADVISORY_ISSUE_PATTERNS.some((pattern) => pattern.test(issue)));
}
