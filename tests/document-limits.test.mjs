import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertDocumentPageCount,
  assertSpreadsheetShape,
  MAX_OCR_PDF_PAGES,
  MAX_PDF_PAGES,
  MAX_SPREADSHEET_ROWS,
  MAX_SPREADSHEET_SHEETS,
} from "../app/document-limits.ts";

test("document parser budgets reject oversized PDF and spreadsheet shapes", () => {
  assert.equal(assertDocumentPageCount(2), 2);
  assert.throws(() => assertDocumentPageCount(MAX_PDF_PAGES + 1), /不能超过/u);
  assert.throws(() => assertDocumentPageCount(MAX_OCR_PDF_PAGES + 1, MAX_OCR_PDF_PAGES), /不能超过/u);
  assert.equal(assertSpreadsheetShape(MAX_SPREADSHEET_SHEETS, MAX_SPREADSHEET_ROWS), true);
  assert.throws(() => assertSpreadsheetShape(MAX_SPREADSHEET_SHEETS + 1, 1), /工作表/u);
  assert.throws(() => assertSpreadsheetShape(1, MAX_SPREADSHEET_ROWS + 1), /行/u);
});

test("bill parser keeps the resource budget wired into every document path", () => {
  const source = readFileSync("app/bill-file-parser.ts", "utf8");
  assert.match(source, /sheetRows: MAX_SPREADSHEET_ROWS \+ 1/u);
  assert.match(source, /assertSpreadsheetShape\(workbook\.SheetNames\.length, rows\.length\)/u);
  assert.match(source, /assertDocumentPageCount\(document\.numPages, MAX_PDF_PAGES\)/u);
  assert.match(source, /assertDocumentPageCount\(pdfDocument\.numPages, MAX_OCR_PDF_PAGES\)/u);
  assert.match(source, /MAX_PDF_TEXT_ITEMS_PER_PAGE/u);
  assert.match(source, /try \{\s*document = await loadingTask\.promise[\s\S]*finally \{[\s\S]{0,120}loadingTask\.destroy\(\)/u);
  assert.match(source, /try \{\s*pdfDocument = await loadingTask\.promise[\s\S]*finally \{[\s\S]{0,120}loadingTask\.destroy\(\)/u);
});
