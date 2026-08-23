"use client";

import { collectionPageOptions } from "./collection-pagination-core.js";

export function CollectionPagination({ page, totalPages, totalRows, label, unit, onChange }: {
  page: number;
  totalPages: number;
  totalRows: number;
  label: string;
  unit: string;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="bill-pagination collection-pagination" aria-label={label}>
      <button type="button" className="bill-page-arrow" aria-label={`${label}上一页`} title="上一页" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
      <label>
        <span>第</span>
        <select value={page} aria-label={`${label}页码`} onChange={(event) => onChange(Number(event.target.value))}>
          {collectionPageOptions(page, totalPages).map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
        <span>/ {totalPages} 页 · 共 {totalRows} {unit}</span>
      </label>
      <button type="button" className="bill-page-arrow" aria-label={`${label}下一页`} title="下一页" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>›</button>
    </nav>
  );
}
