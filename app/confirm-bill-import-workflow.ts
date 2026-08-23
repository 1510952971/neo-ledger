type ImportRow = { accountId: number };

export type ConfirmBillImportResult = {
  kind: "unmapped" | "failed" | "imported";
  error: string;
  imported: number;
  duplicates: number;
};

export async function confirmBillImportWorkflow<Row extends ImportRow>(input: {
  rows: Row[];
  submitRows: (rows: Row[]) => Promise<{ imported?: number; duplicates?: number } | null>;
  refreshLedger: () => Promise<void>;
}): Promise<ConfirmBillImportResult> {
  const unmapped = input.rows.filter((row) => row.accountId <= 0).length;
  if (unmapped) {
    return {
      kind: "unmapped",
      error: `还有 ${unmapped} 笔流水没有选择入账账户`,
      imported: 0,
      duplicates: 0,
    };
  }
  const result = await input.submitRows(input.rows);
  if (!result) return { kind: "failed", error: "", imported: 0, duplicates: 0 };
  await input.refreshLedger();
  return {
    kind: "imported",
    error: "",
    imported: result.imported ?? 0,
    duplicates: result.duplicates ?? 0,
  };
}
