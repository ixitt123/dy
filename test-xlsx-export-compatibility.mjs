import assert from "node:assert/strict";
import * as XLSX from "xlsx";

const rows = [{ id: 1, type: "download", status: "completed", title: "安全导出" }];
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(workbook, worksheet, "tasks");

const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
assert.ok(Buffer.isBuffer(buffer), "XLSX export must produce a Node buffer");
assert.equal(buffer.subarray(0, 2).toString("ascii"), "PK", "XLSX output must be a ZIP container");

const restored = XLSX.read(buffer, { type: "buffer" });
assert.equal(restored.SheetNames[0], "tasks");
assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.tasks), rows);

console.log("XLSX task-export compatibility: OK");
