export function collectionPageOptions(page, totalPages, maxOptions = 200) {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  if (safeTotal <= maxOptions) return Array.from({ length: safeTotal }, (_, index) => index + 1);
  const safePage = Math.min(safeTotal, Math.max(1, Math.floor(page)));
  return [...new Set([
    1,
    2,
    safePage - 2,
    safePage - 1,
    safePage,
    safePage + 1,
    safePage + 2,
    safeTotal - 1,
    safeTotal,
  ].filter((item) => item >= 1 && item <= safeTotal))].sort((left, right) => left - right);
}
