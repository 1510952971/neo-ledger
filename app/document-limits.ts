export const MAX_PDF_PAGES = 100;
export const MAX_OCR_PDF_PAGES = 30;
export const MAX_PDF_TEXT_ITEMS_PER_PAGE = 20_000;
export const MAX_SPREADSHEET_SHEETS = 20;
export const MAX_SPREADSHEET_ROWS = 100_000;

export function assertDocumentPageCount(
  pages: unknown,
  maximum: number = MAX_PDF_PAGES,
) {
  if (!Number.isSafeInteger(pages) || Number(pages) < 1)
    throw new Error("文档页数无效");
  if (Number(pages) > maximum)
    throw new Error(`文档不能超过 ${maximum} 页，请拆分后再导入`);
  return Number(pages);
}

export function assertSpreadsheetShape(sheetCount: unknown, rowCount: unknown) {
  if (!Number.isSafeInteger(sheetCount) || Number(sheetCount) < 1)
    throw new Error("表格工作表数量无效");
  if (Number(sheetCount) > MAX_SPREADSHEET_SHEETS)
    throw new Error(`表格不能超过 ${MAX_SPREADSHEET_SHEETS} 个工作表`);
  if (!Number.isSafeInteger(rowCount) || Number(rowCount) < 0)
    throw new Error("表格行数无效");
  if (Number(rowCount) > MAX_SPREADSHEET_ROWS)
    throw new Error(`单个工作表不能超过 ${MAX_SPREADSHEET_ROWS} 行`);
  return true;
}
