import assert from "node:assert/strict";
import { parseJsonFromModelText, structuredJsonInternals } from "./server/core/structured-json.js";

const fenced = [
  "Here is the result:",
  "```json",
  "{",
  '  "post": "Line one',
  'Line two with "quoted" text",',
  '  "images": [',
  "    {",
  '      "title": "Cover",',
  '      "prompt": "A clean image prompt',
  'with a second line and "inner quotes"",',
  '      "negative_prompt": "blur, watermark",',
  "    }",
  "  ],",
  '  "quality_gate": { "ok": true, }',
  "}",
  "```",
].join("\n");

const parsed = parseJsonFromModelText(fenced);
assert.equal(parsed.post, 'Line one\nLine two with "quoted" text');
assert.equal(parsed.images[0].prompt, 'A clean image prompt\nwith a second line and "inner quotes"');
assert.equal(parsed.quality_gate.ok, true);

const extracted = structuredJsonInternals.extractJsonObjectText('before {"a":{"b":1}} after {"ignored":true}');
assert.equal(extracted, '{"a":{"b":1}}');

console.log("Structured JSON parser: OK");
