import {
  categoryFor,
  decodeStatementBytes,
  parseImageStatementText,
  parseCsvRows,
  parseGenericStatementText,
  parseTabularStatement,
} from "./bill-import-core.js";

export type ParsedStatementItem = {
  occurredAt: string;
  merchant: string;
  amount: number;
  type: "支出" | "收入";
  source: string;
  sourceName: string;
  sourceCategory: string;
  category: string;
  incomeCategory: string;
  paymentMethod: string;
  status: string;
  externalId: string;
  currency: "CNY" | "USD" | "JPY" | "EUR";
};

export type ParsedStatement = {
  source: string;
  sourceName: string;
  items: ParsedStatementItem[];
  skipped: number;
  totalRows: number;
  filtered?: number;
  unconfirmed?: number;
  truncated?: number;
};

export type StatementParseProgress = (message: string) => void;

type OcrSession = {
  recognize: (image: File | HTMLCanvasElement) => Promise<string>;
  terminate: () => Promise<unknown>;
};

async function createOcrSession(onProgress?: StatementParseProgress): Promise<OcrSession> {
  if (typeof window === "undefined")
    throw new Error("图片 OCR 需要在网页中运行");
  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("chi_sim", tesseract.OEM.LSTM_ONLY, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    gzip: false,
    logger: (message) => {
      const percent = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
      if (message.status === "recognizing text") onProgress?.(`正在识别图片文字 ${percent}%`);
      else if (/loading|initializing/.test(message.status)) onProgress?.("正在准备中英文识别模型…");
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: tesseract.PSM.AUTO,
    preserve_interword_spaces: "1",
    user_defined_dpi: "180",
  });
  return {
    async recognize(image) {
      const result = await worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
      const visualLines = (result.data.blocks ?? [])
        .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
        .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
      return visualLines.length
        ? visualLines.map((line) => line.text.trim()).filter(Boolean).join("\n")
        : result.data.text;
    },
    terminate: () => worker.terminate(),
  };
}

async function parseSpreadsheet(bytes: Uint8Array, fileName: string) {
  try {
    const xlsx = await import("@e965/xlsx");
    const workbook = xlsx.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      dense: true,
    });
    let lastError: unknown = null;
    const parsedSheets: ParsedStatement[] = [];
    for (const sheetName of workbook.SheetNames) {
      const rows = xlsx.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false,
      });
      try {
        parsedSheets.push(parseTabularStatement(rows, fileName) as ParsedStatement);
      } catch (error) {
        lastError = error;
      }
    }
    if (!parsedSheets.length)
      throw lastError ?? new Error("工作簿中没有可识别的账单表格");
    return {
      source: parsedSheets[0].source,
      sourceName:
        parsedSheets.length === 1
          ? parsedSheets[0].sourceName
          : `${parsedSheets[0].sourceName}（${parsedSheets.length} 个工作表）`,
      items: parsedSheets.flatMap((sheet) => sheet.items),
      skipped: parsedSheets.reduce((sum, sheet) => sum + sheet.skipped, 0),
      totalRows: parsedSheets.reduce((sum, sheet) => sum + sheet.totalRows, 0),
      filtered: parsedSheets.reduce(
        (sum, sheet) => sum + (sheet.filtered ?? sheet.skipped),
        0,
      ),
      unconfirmed: parsedSheets.reduce(
        (sum, sheet) => sum + (sheet.unconfirmed ?? 0),
        0,
      ),
      truncated: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password|encrypt|密码|加密/i.test(message))
      throw new Error("这个表格带有密码保护，请解除密码后再导入");
    throw new Error(message || "无法读取 Excel / WPS 表格");
  }
}

type PdfLine = {
  page: number;
  y: number;
  text: string;
  items: { x: number; text: string }[];
};
type PdfTextItem = { str: string; transform: number[]; width?: number };

async function extractPdfLines(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  // PDF.js may transfer the input buffer to its worker; keep the original for OCR fallback.
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const document = await loadingTask.promise;
  const lines: PdfLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines: { y: number; items: { x: number; text: string }[] }[] = [];
    for (const candidate of content.items) {
      if (!("str" in candidate)) continue;
      const item = candidate as PdfTextItem;
      const text = item.str.trim();
      if (!text) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let line = pageLines.find((current) => Math.abs(current.y - y) <= 2.2);
      if (!line) {
        line = { y, items: [] };
        pageLines.push(line);
      }
      line.items.push({ x, text });
    }
    pageLines
      .sort((a, b) => b.y - a.y)
      .forEach((line) => {
        const items = line.items.sort((a, b) => a.x - b.x);
        lines.push({
          page: pageNumber,
          y: line.y,
          items,
          text: items
            .map((item) => item.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        });
      });
  }
  await loadingTask.destroy();
  return lines;
}

const lastFourOf = (text: string) => {
  const digits = text.match(/(?:借记卡号|账户|账号)[：:]?\s*([\d*\s]+)/)?.[1]
    ?.replace(/\D/g, "");
  return digits?.slice(-4) ?? "";
};

const incomeCategoryForBank = (merchant: string, summary: string) =>
  /工资|薪资|薪酬/.test(`${merchant} ${summary}`)
    ? "薪资发放"
    : /利息|收益|结息/.test(`${merchant} ${summary}`)
      ? "理财收益"
      : "其它收入";

function parseBankOfChina(lines: PdfLine[], fileName: string): ParsedStatement {
  const allText = lines.map((line) => line.text).join("\n");
  const card = lastFourOf(allText);
  const paymentMethod = `中国银行储蓄卡${card ? `(${card})` : ""}`;
  const items: ParsedStatementItem[] = [];
  for (const line of lines) {
    const match = line.text.match(
      /^(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(人民币|美元|日元|欧元)\s+([+-]?[\d,]+\.\d{1,2})\s+[+-]?[\d,]+\.\d{1,2}\s+(.+)$/,
    );
    if (!match) continue;
    const signedAmount = Number(match[4].replaceAll(",", ""));
    if (!Number.isFinite(signedAmount) || signedAmount === 0) continue;
    const sections = match[5]
      .split(/-{5,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    const summary = sections[0]?.split(/\s+/).slice(0, 2).join(" ") || "银行交易";
    const merchant = (sections.slice(1).find((part) => !/^\d/.test(part)) ?? summary)
      .replace(/\s+\d[\d*\sA-Z-]{5,}.*$/i, "")
      .slice(0, 80);
    const type = signedAmount < 0 ? "支出" : "收入";
    items.push({
      occurredAt: `${match[1]} ${match[2]}`,
      merchant,
      amount: Math.abs(signedAmount),
      type,
      source: "bank-boc",
      sourceName: "中国银行",
      sourceCategory: summary,
      category: categoryFor(merchant, summary),
      incomeCategory: incomeCategoryForBank(merchant, summary),
      paymentMethod,
      status: "已记账",
      externalId: `${fileName}:${line.page}:${match[1]}:${match[2]}:${match[4]}`,
      currency:
        match[3] === "美元"
          ? "USD"
          : match[3] === "日元"
            ? "JPY"
            : match[3] === "欧元"
              ? "EUR"
              : "CNY",
    });
  }
  if (!items.length) throw new Error("没有识别到中国银行流水");
  return {
    source: "bank-boc",
    sourceName: "中国银行",
    items,
    skipped: 0,
    totalRows: items.length,
  };
}

function parseAgriculturalBank(lines: PdfLine[], fileName: string): ParsedStatement {
  const allText = lines.map((line) => line.text).join("\n");
  const card = lastFourOf(allText);
  const paymentMethod = `中国农业银行储蓄卡${card ? `(${card})` : ""}`;
  const items: ParsedStatementItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].text.match(
      /^(20\d{6})\s+(?:(\d{6})\s+)?([^\s]+)\s+([+-][\d,]+\.\d{1,2})\s+[\d,]+\.\d{1,2}\s*(.*)$/,
    );
    if (!match) continue;
    const signedAmount = Number(match[4].replaceAll(",", ""));
    if (!Number.isFinite(signedAmount) || signedAmount === 0) continue;
    const date = match[1];
    const time = match[2] ?? "000000";
    const summary = match[3];
    const continuation = lines[index + 1]?.text ?? "";
    const rest = `${match[5]} ${/^(有限公司|及金条|业务网银)/.test(continuation) ? continuation : ""}`;
    const merchant =
      rest
        .replace(/\s+[A-Z]?\d[\d*]{7,}.*$/i, "")
        .replace(/^--\s*/, "")
        .trim()
        .slice(0, 80) || summary;
    const occurredAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
    const type = signedAmount < 0 ? "支出" : "收入";
    items.push({
      occurredAt,
      merchant,
      amount: Math.abs(signedAmount),
      type,
      source: "bank-abc",
      sourceName: "中国农业银行",
      sourceCategory: summary,
      category: categoryFor(merchant, summary),
      incomeCategory: incomeCategoryForBank(merchant, summary),
      paymentMethod,
      status: "已记账",
      externalId: `${fileName}:${lines[index].page}:${date}:${time}:${match[4]}`,
      currency: "CNY",
    });
  }
  if (!items.length) throw new Error("没有识别到中国农业银行流水");
  return {
    source: "bank-abc",
    sourceName: "中国农业银行",
    items,
    skipped: 0,
    totalRows: items.length,
  };
}

type PdfHeaderPositions = {
  amountX?: number;
  debitX?: number;
  creditX?: number;
  balanceX?: number;
};

const numericPdfCell = (value: string) =>
  /^[+-]?(?:¥|￥|\$|€)?[\d,]+\.\d{1,2}$/.test(value.replace(/\s/g, ""));

function pdfHeaderPositions(lines: PdfLine[]) {
  const byPage = new Map<number, PdfHeaderPositions>();
  for (const line of lines) {
    if (!/金额|借方|贷方|支出|收入|余额/.test(line.text)) continue;
    const positions = byPage.get(line.page) ?? {};
    for (const item of line.items) {
      if (/交易金额|发生金额|金额/.test(item.text) && !/余额/.test(item.text))
        positions.amountX ??= item.x;
      if (/借方|支出/.test(item.text) && /金额|借方|支出/.test(item.text))
        positions.debitX ??= item.x;
      if (/贷方|收入/.test(item.text) && /金额|贷方|收入/.test(item.text))
        positions.creditX ??= item.x;
      if (/余额/.test(item.text)) positions.balanceX ??= item.x;
    }
    byPage.set(line.page, positions);
  }
  return byPage;
}

const nearestNumericCell = (
  line: PdfLine,
  targetX: number | undefined,
  excludedX: number | undefined,
) => {
  if (targetX === undefined) return null;
  return line.items
    .filter(
      (item) =>
        numericPdfCell(item.text) &&
        (excludedX === undefined || Math.abs(item.x - excludedX) > 8),
    )
    .sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0] ?? null;
};

function parseAdaptivePdf(lines: PdfLine[], fileName: string): ParsedStatement {
  const allText = lines.map((line) => line.text).join("\n");
  const bankName =
    allText.match(
      /(中国工商银行|中国建设银行|交通银行|招商银行|浦发银行|中信银行|广发银行|平安银行|中国邮政储蓄银行|兴业银行|民生银行|光大银行|农村商业银行)/,
    )?.[1] ?? "银行 PDF";
  const card = lastFourOf(allText);
  const paymentMethod = `${bankName}${card ? `(${card})` : ""}`;
  const headers = pdfHeaderPositions(lines);
  const items: ParsedStatementItem[] = [];
  for (const line of lines) {
    const dateMatch = line.text.match(
      /\b(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|20\d{6})\b/,
    );
    if (!dateMatch) continue;
    const occurredDate = dateMatch[1].includes("-") || dateMatch[1].includes("/")
      ? dateMatch[1]
          .replace(/[年/.]/g, "-")
          .replace("月", "-")
          .replace("日", "")
          .split("-")
          .map((part, index) => (index ? part.padStart(2, "0") : part))
          .join("-")
      : `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}`;
    const afterDate = line.text.slice(
      (dateMatch.index ?? 0) + dateMatch[0].length,
    );
    const timeMatch = afterDate.match(
      /(?:^|\s)(?:(\d{2}):(\d{2})(?::(\d{2}))?|(\d{2})(\d{2})(\d{2})(?=\s))/,
    );
    const hour = timeMatch?.[1] ?? timeMatch?.[4] ?? "00";
    const minute = timeMatch?.[2] ?? timeMatch?.[5] ?? "00";
    const second = timeMatch?.[3] ?? timeMatch?.[6] ?? "00";
    const occurredAt = `${occurredDate} ${hour}:${minute}:${second}`;
    const positions = headers.get(line.page) ?? {};
    const debitCell = nearestNumericCell(line, positions.debitX, positions.balanceX);
    const creditCell = nearestNumericCell(line, positions.creditX, positions.balanceX);
    const amountCell = nearestNumericCell(line, positions.amountX, positions.balanceX);
    const signedCell = line.items.find(
      (item) => /^[+-](?:¥|￥|\$|€)?[\d,]+\.\d{1,2}$/.test(item.text),
    );
    let chosen = signedCell ?? amountCell;
    let type: "支出" | "收入" = "支出";
    if (!chosen && debitCell) chosen = debitCell;
    if (!chosen && creditCell) {
      chosen = creditCell;
      type = "收入";
    }
    if (!chosen) {
      const numericCells = line.items.filter((item) => numericPdfCell(item.text));
      if (numericCells.length === 1) chosen = numericCells[0];
      else continue;
    }
    const signedAmount = Number(
      chosen.text.replace(/[¥￥$€,\s]/g, "").replace(/^\((.+)\)$/, "-$1"),
    );
    if (!Number.isFinite(signedAmount) || signedAmount === 0) continue;
    if (chosen === creditCell || /贷方|收入|入账|转入|退款|工资|结息/.test(line.text))
      type = "收入";
    if (signedAmount < 0 || chosen === debitCell || /借方|支出|扣款|消费|转出/.test(line.text))
      type = "支出";
    const merchant =
      line.text
        .replace(dateMatch[0], " ")
        .replace(timeMatch?.[0]?.trim() ?? "", " ")
        .replace(/(?:[+-]?[¥￥$€]?[\d,]+\.\d{1,2})/g, " ")
        .replace(/人民币|美元|日元|欧元|交易成功|已记账/g, " ")
        .replace(/\s+[A-Z]?\d[\d*]{7,}.*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || `${bankName}交易`;
    items.push({
      occurredAt,
      merchant,
      amount: Math.abs(signedAmount),
      type,
      source: "bank-pdf",
      sourceName: bankName,
      sourceCategory: "银行流水",
      category: categoryFor(merchant),
      incomeCategory: incomeCategoryForBank(merchant, "银行流水"),
      paymentMethod,
      status: "已记账",
      externalId: `${fileName}:${line.page}:${line.y.toFixed(2)}:${occurredAt}:${chosen.text}`,
      currency: /美元/.test(line.text)
        ? "USD"
        : /日元/.test(line.text)
          ? "JPY"
          : /欧元/.test(line.text)
            ? "EUR"
            : "CNY",
    });
  }
  if (!items.length) {
    if (allText.replace(/\s/g, "").length < 80)
      throw new Error("这是图片或扫描型 PDF，当前文件没有可提取的文字层");
    throw new Error("PDF 中没有找到可确认的日期、金额和交易方向");
  }
  return {
    source: "bank-pdf",
    sourceName: bankName,
    items,
    skipped: 0,
    totalRows: items.length,
  };
}

async function ocrPdf(
  bytes: Uint8Array,
  fileName: string,
  getOcr: () => Promise<OcrSession>,
  onProgress?: StatementParseProgress,
) {
  if (typeof document === "undefined")
    throw new Error("这是扫描型 PDF，请在网页中使用图片识别导入");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const pdfDocument = await loadingTask.promise;
  if (pdfDocument.numPages > 30)
    throw new Error("扫描型 PDF 一次最多识别 30 页，请拆分后再导入");
  const ocr = await getOcr();
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    onProgress?.(`正在识别扫描 PDF 第 ${pageNumber}/${pdfDocument.numPages} 页…`);
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, Math.sqrt(12_000_000 / (baseViewport.width * baseViewport.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("浏览器无法渲染 PDF 页面");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pageTexts.push(await ocr.recognize(canvas));
    canvas.width = 1;
    canvas.height = 1;
  }
  await loadingTask.destroy();
  return parseImageStatementText(pageTexts.join("\n"), fileName) as ParsedStatement;
}

async function parsePdf(
  bytes: Uint8Array,
  fileName: string,
  getOcr: () => Promise<OcrSession>,
  onProgress?: StatementParseProgress,
) {
  const lines = await extractPdfLines(bytes);
  const allText = lines.map((line) => line.text).join("\n");
  if (/中国银行交易流水明细清单/.test(allText))
    return parseBankOfChina(lines, fileName);
  if (/中国农业银行账户活期交易明细清单/.test(allText))
    return parseAgriculturalBank(lines, fileName);
  try {
    return parseAdaptivePdf(lines, fileName);
  } catch (adaptiveError) {
    try {
      return parseGenericStatementText(allText, fileName) as ParsedStatement;
    } catch {
      try {
        return await ocrPdf(bytes, fileName, getOcr, onProgress);
      } catch (ocrError) {
        if (allText.replace(/\s/g, "").length >= 80) throw adaptiveError;
        throw ocrError;
      }
    }
  }
}

async function parseOneStatementFile(
  file: File,
  getOcr: () => Promise<OcrSession>,
  onProgress?: StatementParseProgress,
): Promise<ParsedStatement> {
  if (file.size > 20 * 1024 * 1024) throw new Error("单个账单文件不能超过 20MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    extension &&
    ["xls", "xlsx", "xlsm", "xlsb", "ods", "et", "ett"].includes(extension)
  )
    return parseSpreadsheet(bytes, file.name);
  if (extension === "pdf") {
    try {
      return await parsePdf(bytes, file.name, getOcr, onProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/password|密码/i.test(message))
        throw new Error("这个 PDF 带有密码保护，请解除密码后再导入");
      throw error;
    }
  }
  if (
    (extension && ["jpg", "jpeg", "png", "webp", "bmp", "gif"].includes(extension)) ||
    file.type.startsWith("image/")
  ) {
    onProgress?.(`正在识别图片 ${file.name}…`);
    const ocr = await getOcr();
    const text = await ocr.recognize(file);
    return parseImageStatementText(text, file.name, new Date(file.lastModified || Date.now())) as ParsedStatement;
  }
  const text = decodeStatementBytes(bytes);
  if (extension === "csv") {
    try {
      return parseTabularStatement(parseCsvRows(text), file.name) as ParsedStatement;
    } catch {
      return parseGenericStatementText(text, file.name) as ParsedStatement;
    }
  }
  return parseGenericStatementText(text, file.name) as ParsedStatement;
}

export async function parseStatementFiles(
  files: File[],
  onProgress?: StatementParseProgress,
) {
  let ocrPromise: Promise<OcrSession> | null = null;
  const getOcr = () => (ocrPromise ??= createOcrSession(onProgress));
  const statements: { fileName: string; statement: ParsedStatement }[] = [];
  const failures: { fileName: string; error: string }[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress?.(`正在读取第 ${index + 1}/${files.length} 个文件：${file.name}`);
      try {
        statements.push({
          fileName: file.name,
          statement: await parseOneStatementFile(file, getOcr, onProgress),
        });
      } catch (error) {
        failures.push({
          fileName: file.name,
          error: error instanceof Error ? error.message : "无法读取这个文件",
        });
      }
    }
  } finally {
    if (ocrPromise) {
      try {
        await (await ocrPromise).terminate();
      } catch {
        // Individual file errors above already explain an OCR startup failure.
      }
    }
  }
  return { statements, failures };
}

export async function parseStatementFile(
  file: File,
  onProgress?: StatementParseProgress,
): Promise<ParsedStatement> {
  const result = await parseStatementFiles([file], onProgress);
  if (result.statements[0]) return result.statements[0].statement;
  throw new Error(result.failures[0]?.error ?? "无法读取这个账单文件");
}
