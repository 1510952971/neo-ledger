export const BILL_PAGE_SIZE = 20;
export const COLLECTION_PAGE_SIZE = 10;
export const ASSET_PAGE_SIZE = COLLECTION_PAGE_SIZE;

export function paginateBills(rows, requestedPage, pageSize = BILL_PAGE_SIZE) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safePageSize =
    Number.isInteger(pageSize) && pageSize > 0 ? pageSize : BILL_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(safeRows.length / safePageSize));
  const numericPage = Number(requestedPage);
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isInteger(numericPage) ? numericPage : 1),
  );
  const start = (page - 1) * safePageSize;
  return {
    rows: safeRows.slice(start, start + safePageSize),
    page,
    pageSize: safePageSize,
    totalPages,
    totalRows: safeRows.length,
  };
}
