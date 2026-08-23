type AccountType = "资产" | "负债";
type Currency = string;
type ImportRow = {
  accountId: number;
  accountName: string;
  [key: string]: unknown;
};
type OperationResult<T> = { response: Response; data: T | null };

export type BillImportAccountSuggestion = {
  name: string;
  type: AccountType;
  currency: Currency;
};

export type BillImportAccountWorkflowResult<Row extends ImportRow> = {
  kind: "imported" | "import-failed";
  accountId: number;
  accountName: string;
  mappedRows: Row[];
  imported: number;
};

export async function runBillImportAccountWorkflow<Row extends ImportRow>(input: {
  ledgerId: number;
  rows: Row[];
  suggestion: BillImportAccountSuggestion;
  existingAccountId?: number;
  createAccount: (input: {
    ledgerId: number;
    name: string;
    type: AccountType;
    currency: Currency;
  }) => Promise<OperationResult<{ id?: number; error?: string }>>;
  submitRows: (rows: Row[]) => Promise<{ imported?: number } | null>;
  reloadAccounts: () => Promise<void>;
}): Promise<BillImportAccountWorkflowResult<Row>> {
  let accountId = input.existingAccountId ?? 0;
  if (!accountId) {
    const created = await input.createAccount({
      ledgerId: input.ledgerId,
      name: input.suggestion.name,
      type: input.suggestion.type,
      currency: input.suggestion.currency,
    });
    if (!created.response.ok || !created.data?.id)
      throw new Error(created.data?.error || "新建账户失败");
    accountId = Number(created.data.id);
  }
  if (!Number.isSafeInteger(accountId) || accountId <= 0)
    throw new Error("账户编号无效");
  const mappedRows = input.rows.map((row) => ({
    ...row,
    accountId,
    accountName: input.suggestion.name,
  }));
  const imported = await input.submitRows(mappedRows);
  if (!imported) {
    await input.reloadAccounts();
    return {
      kind: "import-failed",
      accountId,
      accountName: input.suggestion.name,
      mappedRows,
      imported: 0,
    };
  }
  await input.reloadAccounts();
  return {
    kind: "imported",
    accountId,
    accountName: input.suggestion.name,
    mappedRows,
    imported: imported.imported ?? mappedRows.length,
  };
}
