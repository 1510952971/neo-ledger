export type BillImportSummary = {
  fileName: string;
  sourceName: string;
  detected: number;
  ready: number;
  pending: number;
  skipped: number;
  duplicates: number;
  possibleDuplicates: number;
  unmapped: number;
  autoImported: number;
  totalRows: number;
  filtered: number;
  unconfirmed: number;
  truncated: number;
  files: {
    fileName: string;
    totalRows: number;
    success: number;
    filtered: number;
    unconfirmed: number;
    truncated: number;
  }[];
};

type ParsedStatement<Item> = {
  fileName: string;
  statement: {
    sourceName: string;
    items: Item[];
    totalRows: number;
    skipped: number;
    filtered?: number;
    unconfirmed?: number;
    truncated?: number;
  };
};

type ParsedBatch<Item> = {
  statements: ParsedStatement<Item>[];
  failures: Array<{ fileName: string; error: string }>;
};

type PreviewResult<Item> = {
  items?: Item[];
  detected?: number;
  duplicates?: number;
  possibleDuplicates?: number;
  unmapped?: number;
  unconfirmed?: number;
  truncated?: number;
  error?: string;
};

type RequestResult<T> = { response: Response; data: T | null };
type WriteResult = { imported?: number };

export type BillImportWorkflowResult<Item> = {
  kind: "empty" | "preview-error" | "automatic-failed" | "ready";
  error: string;
  items: Item[];
  reviewItems: Item[];
  summary: BillImportSummary | null;
  automaticRows: Item[];
  autoImported: number;
  failuresMessage: string;
};

export async function runBillImportWorkflow<Item>(input: {
  files: File[];
  ledgerId: number;
  parseFiles: (
    files: File[],
    onStatus: (value: string) => void,
  ) => Promise<ParsedBatch<Item>>;
  preview: (ledgerId: number, items: Item[]) => Promise<RequestResult<PreviewResult<Item>>>;
  partition: (items: Item[]) => { automatic: Item[]; review: Item[] };
  submitRows: (rows: Item[]) => Promise<WriteResult | null>;
  reloadAccounts: () => Promise<void>;
  onStatus?: (value: string) => void;
}): Promise<BillImportWorkflowResult<Item>> {
  const parsedBatch = await input.parseFiles(input.files, input.onStatus ?? (() => undefined));
  if (!parsedBatch.statements.length) {
    return {
      kind: "empty",
      error:
        parsedBatch.failures.map((item) => `${item.fileName}：${item.error}`).join("；") ||
        "没有识别到有效流水",
      items: [],
      reviewItems: [],
      summary: null,
      automaticRows: [],
      autoImported: 0,
      failuresMessage: "",
    };
  }

  const parsedItems = parsedBatch.statements.flatMap(({ statement }) => statement.items);
  const preview = await input.preview(input.ledgerId, parsedItems);
  const result = preview.data ?? {};
  if (!preview.response.ok) {
    return {
      kind: "preview-error",
      error: result.error ?? "解析失败",
      items: [],
      reviewItems: [],
      summary: null,
      automaticRows: [],
      autoImported: 0,
      failuresMessage: "",
    };
  }

  const items = result.items ?? [];
  const sourceNames = [
    ...new Set(parsedBatch.statements.map(({ statement }) => statement.sourceName)),
  ];
  const fileReconciliations = parsedBatch.statements.map(({ fileName, statement }) => ({
    fileName,
    totalRows: statement.totalRows,
    success: statement.items.length,
    filtered: statement.filtered ?? statement.skipped,
    unconfirmed:
      statement.unconfirmed ??
      Math.max(0, statement.totalRows - statement.items.length - statement.skipped),
    truncated: statement.truncated ?? 0,
  }));
  const summary: BillImportSummary = {
    fileName: input.files.length === 1 ? input.files[0].name : `${input.files.length} 个文件`,
    sourceName: sourceNames.length === 1 ? sourceNames[0] : `${sourceNames.length} 类账单`,
    detected: result.detected ?? parsedItems.length,
    ready: items.length,
    pending: items.length,
    skipped: parsedBatch.statements.reduce((sum, { statement }) => sum + statement.skipped, 0),
    duplicates: result.duplicates ?? 0,
    possibleDuplicates: result.possibleDuplicates ?? 0,
    unmapped: result.unmapped ?? 0,
    autoImported: 0,
    totalRows: fileReconciliations.reduce((sum, row) => sum + row.totalRows, 0),
    filtered:
      fileReconciliations.reduce((sum, row) => sum + row.filtered, 0) +
      (result.duplicates ?? 0),
    unconfirmed:
      fileReconciliations.reduce((sum, row) => sum + row.unconfirmed, 0) +
      (result.unconfirmed ?? 0),
    truncated:
      fileReconciliations.reduce((sum, row) => sum + row.truncated, 0) +
      (result.truncated ?? 0),
    files: fileReconciliations,
  };
  const partitioned = input.partition(items);
  const automaticRows = partitioned.automatic;
  const reviewItems = partitioned.review;
  let autoImported = 0;
  if (automaticRows.length) {
    input.onStatus?.(`已识别账户，正在自动导入 ${automaticRows.length} 笔流水…`);
    const automaticResult = await input.submitRows(automaticRows);
    if (!automaticResult) {
      return {
        kind: "automatic-failed",
        error: "",
        items,
        reviewItems: items,
        summary,
        automaticRows,
        autoImported: 0,
        failuresMessage: "",
      };
    }
    autoImported = automaticResult.imported ?? automaticRows.length;
    summary.autoImported = autoImported;
    summary.pending = reviewItems.length;
    summary.unmapped = reviewItems.filter((item) => {
      const accountId = (item as { accountId?: unknown }).accountId;
      return typeof accountId !== "number" || accountId <= 0;
    }).length;
    await input.reloadAccounts();
  }
  return {
    kind: "ready",
    error: "",
    items,
    reviewItems,
    summary,
    automaticRows,
    autoImported,
    failuresMessage: parsedBatch.failures.length
      ? `${parsedBatch.failures.length} 个文件未加入：${parsedBatch.failures
          .map((item) => `${item.fileName}（${item.error}）`)
          .join("；")}`
      : "",
  };
}
