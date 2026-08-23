/** Export and restore share a 50 MiB transport budget. Keep a safety margin
 * because JSON framing, sync metadata and UTF-8 expansion add overhead. */
export const MAX_EXPORT_ESTIMATED_BYTES = 50 * 1024 * 1024;
const EXPORT_BASE_BYTES = 64 * 1024;
const EXPORT_TRANSACTION_BYTES = 1_200;
const EXPORT_OTHER_RECORD_BYTES = 640;

/** Measure the actual UTF-8 wire size instead of trusting JavaScript string length. */
export function encodedExportBytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function estimateExportBytes(input: {
  transactions: number;
  otherRecords: number;
}) {
  const transactions = Math.max(0, Math.floor(Number(input.transactions) || 0));
  const otherRecords = Math.max(0, Math.floor(Number(input.otherRecords) || 0));
  return EXPORT_BASE_BYTES +
    transactions * EXPORT_TRANSACTION_BYTES +
    otherRecords * EXPORT_OTHER_RECORD_BYTES;
}
