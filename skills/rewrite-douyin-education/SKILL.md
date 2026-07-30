# rewrite-douyin-education

## Purpose

Rewrite extracted Douyin transcripts into original education-training and enrollment-conversion copy for short videos, Moments posts, and parent-facing communication.

## Inputs

- Original Douyin transcript
- AI analysis JSON
- Category and tags
- Reference style profile
- Rewrite direction
- Tone level
- Conflict level
- Sales level
- Humanize level
- 3-10 reference examples when available

## Output

For ordinary rewrites, return only the versions requested by the caller.

When the `家长触动与转化模板` is enabled, return exactly these two complete versions:

1. 触动咨询版：低压力的“留言或私信聊聊孩子目前的情况”类引导。
2. 行动号召版：更明确地邀请咨询或进一步了解，但不虚构试听、名额、成绩、课程或服务承诺。

## Style Requirements

- 痞里带刺
- 接地气
- 有冲突
- 有观点
- 少废话
- 家长听得懂
- 不要官方味
- 不要 AI 味
- 更像真人在说话
- 适合教育招生和转化
- 每篇都必须有完整弧线：具体钩子 → 家长真实痛点/冲突 → 情绪递进 → 转折 → 围绕孩子与家长真实选择或代价的高潮 → 解决视角 → 回味或行动。
- 钩子须从原文中选择反常识、具体场景、家长误区或后果预警；不能用空泛口号。

## Required Process

1. Extract the original structure: hook, pain, emotion, reverse, solution, CTA.
2. Rebuild the structure for the selected rewrite direction.
3. Inject the selected style profile.
4. Learn rhythm and structure from reference examples without copying.
5. Remove AI-flavored wording and mechanical rhythm.
6. 输出调用方请求数量的完整成稿；家长触动与转化模板固定输出两篇。
7. 对家长触动与转化模板，逐篇标明可在正文中找到的 hook、painConflict、turn、climax、ending 证据短语，正文不写结构标签。

## Prohibited

- Do not directly copy the original text.
- Do not fabricate facts, teachers, results, or cases.
- Do not promise score increases or admission outcomes.
- Do not invent schools, teachers, courses, trial lessons, places, promotions, service details, results, contact methods, or testimonials.
- Do not over-amplify fear.
- Do not use absolute claims such as 包过、保过、百分百、稳赚不赔.
- Do not sound like an official announcement or AI essay.
