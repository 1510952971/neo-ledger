const cleanCell = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\t/g, "")
    .replace(/\s+/g, " ")
    .trim();

const cleanHeader = (value) => cleanCell(value).replace(/[：:]/g, "");

export function decodeStatementBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] === 0xff && data[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(data);
  if (data[0] === 0xfe && data[1] === 0xff)
    return new TextDecoder("utf-16be").decode(data);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return new TextDecoder("gb18030").decode(data);
  }
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cleanCell(cell));
      cell = "";
    } else if (char === "\n") {
      row.push(cleanCell(cell));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cleanCell(cell));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeDate(value) {
  const text = cleanCell(value);
  const compact = text.match(
    /^(20\d{2})(\d{2})(\d{2})(?:\s+(\d{2})(\d{2})(\d{2}))?/,
  );
  if (compact)
    return `${compact[1]}-${compact[2]}-${compact[3]} ${compact[4] ?? "00"}:${compact[5] ?? "00"}:${compact[6] ?? "00"}`;
  const normal = text.match(
    /^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]\s*(\d{1,2}):?(\d{2})?(?::?(\d{2}))?)?/,
  );
  if (!normal) return "";
  return `${normal[1]}-${normal[2].padStart(2, "0")}-${normal[3].padStart(2, "0")} ${String(normal[4] ?? "00").padStart(2, "0")}:${String(normal[5] ?? "00").padStart(2, "0")}:${String(normal[6] ?? "00").padStart(2, "0")}`;
}

function parseMoney(value) {
  const cleaned = cleanCell(value)
    .replace(/[¥￥$€元人民币CNYRMB,\s]/gi, "")
    .replace(/^\((.+)\)$/, "-$1");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

export function categoryFor(merchant, sourceCategory = "") {
  const text = `${sourceCategory} ${merchant}`;
  if (/咖啡|拿铁|星巴克|瑞幸|茶饮|奶茶/.test(text)) return "咖啡";
  if (/餐饮|美食|食品|酒饮|外卖|饭|餐|超市|便利店|生鲜|零食|红包/.test(text))
    return "餐饮";
  if (/交通|出行|骑行|地铁|公交|滴滴|铁路|航空|出租|车票|加油/.test(text))
    return "交通";
  if (/娱乐|文化|休闲|游戏|电影|视频|会员|爱奇艺|音乐|演出|景区|门票|旅游|旅行|酒店/.test(text))
    return "娱乐";
  return "购物";
}

function incomeCategoryFor(merchant, sourceCategory = "") {
  const text = `${sourceCategory} ${merchant}`;
  return /工资|薪资|薪酬/.test(text)
    ? "薪资发放"
    : /利息|收益|理财|结息/.test(text)
      ? "理财收益"
      : /兼职|稿费|佣金|外快/.test(text)
        ? "兼职外快"
        : "其它收入";
}

function meaningful(value) {
  const text = cleanCell(value);
  return text && text !== "/" && !/^-+$/.test(text) ? text : "";
}

function platformFrom(rows, fileName) {
  const preamble = `${fileName}\n${rows.slice(0, 24).flat().join("\n")}`;
  if (/微信支付账单/.test(preamble)) return { id: "wechat", name: "微信支付" };
  if (/支付宝/.test(preamble)) return { id: "alipay", name: "支付宝" };
  if (/美团/.test(preamble)) return { id: "meituan", name: "美团" };
  if (/京东/.test(preamble)) return { id: "jd", name: "京东" };
  return { id: "generic", name: "通用账单" };
}

function headerRowIndex(rows) {
  return rows.findIndex((row) => {
    const headers = row.map(cleanHeader);
    return (
      headers.some((value) => /交易.*时间|记账日期/.test(value)) &&
      headers.some((value) => /金额/.test(value)) &&
      headers.some((value) => /收\/支|商户|交易对方|订单标题|商品/.test(value))
    );
  });
}

function rowObject(headers, row) {
  return Object.fromEntries(
    headers.map((header, index) => [cleanHeader(header), cleanCell(row[index])]),
  );
}

const firstValue = (record, ...keys) => {
  for (const key of keys) {
    const value = meaningful(record[key]);
    if (value) return value;
  }
  return "";
};

function merchantFor(source, record) {
  const counterparty = firstValue(record, "交易对方", "商户名称", "对手信息");
  const product = firstValue(record, "商品", "商品说明", "订单标题", "交易说明");
  if (source.id === "wechat") return product || counterparty || "微信交易";
  if (source.id === "alipay") {
    if (product && !/客服|订单号|^[A-Z]*\d{10,}/i.test(product)) return product;
    return counterparty || product || "支付宝交易";
  }
  if (source.id === "meituan") return product.replace(/\s*订单详情$/, "") || "美团交易";
  if (source.id === "jd") return product || counterparty || "京东交易";
  return product || counterparty || firstValue(record, "交易类型", "交易分类") || "账单导入";
}

export function parseTabularStatement(rows, fileName = "") {
  const source = platformFrom(rows, fileName);
  const headerIndex = headerRowIndex(rows);
  if (headerIndex < 0) throw new Error("没有找到可识别的账单表头");
  const headers = rows[headerIndex].map(cleanHeader);
  const items = [];
  let filtered = 0;
  let unconfirmed = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const record = rowObject(headers, row);
    const flow = firstValue(record, "收/支", "收支", "借贷标志");
    const status = firstValue(record, "当前状态", "交易状态", "状态");
    const tradeType = firstValue(record, "交易类型");
    if (
      /不计收支|中性|其他/.test(flow) ||
      /关闭|失败|取消|撤销/.test(status) ||
      (source.id === "meituan" && /还款/.test(tradeType))
    ) {
      filtered += 1;
      continue;
    }
    const rawAmount = firstValue(
      record,
      "实付金额",
      "金额(元)",
      "交易金额",
      "金额",
      "订单金额",
    );
    const signedAmount = parseMoney(rawAmount);
    const occurredAt = normalizeDate(
      firstValue(record, "交易成功时间", "交易时间", "交易创建时间", "记账时间"),
    );
    if (!occurredAt || !Number.isFinite(signedAmount) || signedAmount === 0) {
      unconfirmed += 1;
      continue;
    }
    const type = /收入|入账|退款|贷方|credit/i.test(flow)
      ? "收入"
      : /支出|消费|扣款|借方|debit/i.test(flow)
        ? "支出"
        : signedAmount < 0
          ? "支出"
          : "收入";
    const merchant = merchantFor(source, record).slice(0, 80);
    const sourceCategory = firstValue(record, "交易分类", "交易类型");
    const paymentMethod = firstValue(record, "支付方式", "收/付款方式", "付款方式");
    items.push({
      occurredAt,
      merchant,
      amount: Math.abs(signedAmount),
      type,
      source: source.id,
      sourceName: source.name,
      sourceCategory,
      category: categoryFor(merchant, sourceCategory),
      incomeCategory: incomeCategoryFor(merchant, sourceCategory),
      paymentMethod: paymentMethod || source.name,
      status,
      externalId: firstValue(record, "交易单号", "交易订单号", "订单号"),
      currency: "CNY",
    });
  }
  if (!items.length) throw new Error("没有识别到有效的收入或支出流水");
  return {
    source: source.id,
    sourceName: source.name,
    items,
    skipped: filtered + unconfirmed,
    filtered,
    unconfirmed,
    truncated: 0,
    totalRows: rows.length - headerIndex - 1,
  };
}

export function parseGenericStatementText(rawText, fileName = "") {
  const text = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&");
  const items = [];
  for (const line of text.split(/\n+/).map(cleanCell)) {
    if (/特别提示|本明细|统计逻辑|涂改|编造|证明效力/.test(line)) continue;
    const date = line.match(
      /(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)/,
    );
    if (!date) continue;
    const amountMatches = [...line.matchAll(/[¥￥$€]?\s*([+-]?\d[\d,]*\.\d{1,2})\s*(?:元|CNY|RMB)?/g)];
    const amountMatch = amountMatches.at(-1);
    if (!amountMatch) continue;
    const amount = parseMoney(amountMatch[1]);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const occurredAt = normalizeDate(date[1]);
    const type = /收入|入账|退款|贷方|credit/i.test(line) &&
      !/支出|消费|扣款|借方|debit/i.test(line)
      ? "收入"
      : amount < 0
        ? "支出"
        : "支出";
    const merchant = line
      .replace(date[0], " ")
      .replace(amountMatch[0], " ")
      .replace(/[|,，;；]+/g, " ")
      .replace(/交易时间|金额|收入|支出|扣款|人民币/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (merchant.length < 2) continue;
    items.push({
      occurredAt,
      merchant,
      amount: Math.abs(amount),
      type,
      source: "generic",
      sourceName: fileName || "通用账单",
      sourceCategory: "",
      category: categoryFor(merchant),
      incomeCategory: incomeCategoryFor(merchant),
      paymentMethod: "待选择账户",
      status: "",
      externalId: "",
      currency: "CNY",
    });
  }
  if (!items.length) throw new Error("没有识别到有效流水");
  return {
    source: "generic",
    sourceName: fileName || "通用账单",
    items,
    skipped: 0,
    filtered: 0,
    unconfirmed: 0,
    truncated: 0,
    totalRows: items.length,
  };
}

const normalizeOcrText = (value) =>
  cleanCell(value)
    .replace(/[−–—﹣]/g, "-")
    .replace(/[￥]/g, "¥")
    .replace(/[…]{2,}/g, "…");

const imageStatementSource = (text) => {
  if (/零钱明细|零钱余额/.test(text))
    return { id: "wechat-image", name: "微信零钱截图", paymentMethod: "微信零钱" };
  if (/财付通|借记卡|信用卡|收支记录|人民币元/.test(text)) {
    const lastFour = text.match(/(?:借记卡|信用卡|储蓄卡)[^\d]*(\d{4})/)?.[1];
    return {
      id: "bank-image",
      name: "银行卡截图",
      paymentMethod: `银行卡${lastFour ? `(${lastFour})` : ""}`,
    };
  }
  if (/支付宝|余额宝|搜索交易记录|收支分析/.test(text))
    return { id: "alipay-image", name: "支付宝截图", paymentMethod: "支付宝" };
  if (/京东|白条|食品酒饮|京东外部商户|其他网购/.test(text))
    return { id: "jd-image", name: "京东截图", paymentMethod: "京东" };
  if (/美团|月付|刮现金/.test(text))
    return {
      id: "meituan-image",
      name: "美团截图",
      paymentMethod: /月付|刮现金/.test(text) ? "美团月付" : "美团",
    };
  return { id: "image", name: "图片账单", paymentMethod: "待选择账户" };
};

const ocrMoneyMatches = (line) => [
  ...line.matchAll(
    /(?:人民币元|人民币|[#¥Y])?\s*([+\-]?\s*\d[\d,]*(?:\.\d{1,2}|,\d{1,2}))\b/g,
  ),
];

const parseOcrMoney = (value) => {
  let text = String(value).replace(/\s/g, "");
  if (!text.includes(".") && /,\d{1,2}$/.test(text)) {
    const comma = text.lastIndexOf(",");
    text = `${text.slice(0, comma).replaceAll(",", "")}.${text.slice(comma + 1)}`;
  } else text = text.replaceAll(",", "");
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const pad2 = (value) => String(value).padStart(2, "0");

const monthNearContext = (month, contextMonth) => {
  if (!contextMonth) return month;
  const previousMonth = contextMonth === 1 ? 12 : contextMonth - 1;
  return month === contextMonth || month === previousMonth ? month : contextMonth;
};

function ocrDateFromLine(line, context, referenceDate) {
  const full = line.match(
    /(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (full)
    return `${full[1]}-${pad2(full[2])}-${pad2(full[3])} ${pad2(full[4] ?? "00")}:${full[5] ?? "00"}:00`;
  const chinese = line.match(/(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/);
  if (chinese) {
    const month = monthNearContext(Number(chinese[1]), context.month);
    const year = context.month && month > context.month + 5 ? context.year - 1 : context.year;
    return `${year}-${pad2(month)}-${pad2(chinese[2])} ${pad2(chinese[3] ?? "00")}:${chinese[4] ?? "00"}:00`;
  }
  const compact = line.match(/(?:^|\s)(\d{1,2})-(\d{1,2})(?:\s*(\d{2}):(\d{2}))?(?:\s|$)/);
  if (compact) {
    const month = monthNearContext(Number(compact[1]), context.month);
    const year = context.month && month > context.month + 5 ? context.year - 1 : context.year;
    return `${year}-${pad2(month)}-${pad2(compact[2])} ${pad2(compact[3] ?? "00")}:${compact[4] ?? "00"}:00`;
  }
  const relative = line.match(/(今天|今日|昨天|昨日)\s*(\d{1,2}):(\d{2})/);
  if (relative) {
    const date = new Date(referenceDate);
    if (/昨/.test(relative[1])) date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(relative[2])}:${relative[3]}:00`;
  }
  return "";
}

const nonMerchantOcrLine = (line) =>
  !line ||
  /^(全部|支出|收入|转账|退款|还款|订单|筛选|搜索|收支统计|收支分析|收支记录|月度账单|账单|交易记录|食品酒饮|餐饮美食|商业服务|投资理财|其他|医疗保健|其他网购|网上消费|商超便利|美团月付|白条)$/.test(
    line,
  ) ||
  /^(?:今天|今日|昨天|昨日)?\s*\d{1,2}:\d{2}$/.test(line) ||
  /^(?:20\d{2}[年.\-/])?\d{1,2}[月\-/]\d{0,2}日?(?:\s+星期.)?$/.test(line) ||
  /(?:零钱|账户)余额|共\d+件|星期[一二三四五六日天]|当前账号|全部账户|收支统计/.test(line);

function merchantFromOcrLine(lines, index, amountText) {
  const clean = (line) =>
    normalizeOcrText(line)
      .replace(amountText, " ")
      .replace(/(?:人民币元|人民币|[#¥Y])\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const own = clean(lines[index]);
  if (own && !nonMerchantOcrLine(own) && !/^[-+]?\d/.test(own)) return own;
  for (const offset of [-1, -2, 1, -3, 2]) {
    const candidate = clean(lines[index + offset] ?? "");
    if (
      candidate &&
      !nonMerchantOcrLine(candidate) &&
      !ocrMoneyMatches(candidate).length &&
      !ocrDateFromLine(candidate, { year: 2000, month: 0 }, new Date(0))
    )
      return candidate;
  }
  return "图片账单";
}

/** Parse OCR text from mobile statement screenshots without trusting summary totals. */
export function parseImageStatementText(rawText, fileName = "", referenceDate = new Date()) {
  const lines = String(rawText)
    .split(/\n+/)
    .map(normalizeOcrText)
    .filter(Boolean);
  const allText = lines.join("\n");
  const source = imageStatementSource(allText);
  const sourceName = source.id === "image" && fileName ? fileName : source.name;
  const explicitYear = Number(allText.match(/(20\d{2})年/)?.[1]);
  const context = {
    year: explicitYear || referenceDate.getFullYear(),
    month: 0,
    inheritedDate: "",
  };
  const items = [];
  const seen = new Set();
  let filtered = 0;
  let unconfirmed = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const yearMonth = line.match(/^(20\d{2})[年.]\s*(\d{1,2})(?:月|\b)/);
    const monthHeader = line.match(/^(\d{1,2})月(?:\s*\/[A-Za-z]+)?(?:\s|$)/);
    if (yearMonth) {
      context.year = Number(yearMonth[1]);
      context.month = Number(yearMonth[2]);
    } else if (monthHeader && !/\d{1,2}日/.test(line))
      context.month = Number(monthHeader[1]);
    const lineDate = ocrDateFromLine(line, context, referenceDate);
    if (lineDate) context.inheritedDate = lineDate.slice(0, 10);
    if (yearMonth || (monthHeader && !/\d{1,2}日/.test(line))) continue;
    const matches = ocrMoneyMatches(line);
    if (!matches.length) continue;
    if (
      /(?:零钱|账户)余额\s*[#¥Y\d]|月度账单|支出\s*[#¥Y]?\s*\d|收入\s*[#¥Y]?\s*\d|支出.*收入|收支统计/.test(line)
    )
      continue;
    const amountMatch = matches.at(-1);
    const signedAmount = parseOcrMoney(amountMatch[1]);
    if (!Number.isFinite(signedAmount) || signedAmount === 0) continue;
    let merchant = merchantFromOcrLine(lines, index, amountMatch[0])
      .replace(/^(?:后|铝|电|和|号|\||《只)\s*[，,]?\s*(?=财付通|余额宝|农耕记|客服)/, "")
      .replace(/\s+[—…\.]{2,}$/, "")
      .slice(0, 80);
    if (source.id === "bank-image" && /(?:借记卡|信用卡|储蓄卡)\d{4}/.test(merchant)) {
      const previous = normalizeOcrText(lines[index - 1] ?? "");
      if (previous && !nonMerchantOcrLine(previous) && !ocrMoneyMatches(previous).length)
        merchant = previous.slice(0, 80);
    }
    if (/自动还款|代扣还款|信用卡还款|不计入/.test(`${merchant} ${line}`)) {
      filtered += 1;
      continue;
    }
    let occurredAt = lineDate;
    if (!occurredAt && source.id === "bank-image" && context.inheritedDate)
      occurredAt = `${context.inheritedDate} 00:00:00`;
    if (!occurredAt) {
      for (let offset = 1; offset <= 3 && !occurredAt; offset += 1)
        occurredAt = ocrDateFromLine(lines[index + offset] ?? "", context, referenceDate);
    }
    if (!occurredAt && context.inheritedDate)
      occurredAt = `${context.inheritedDate} 00:00:00`;
    if (!occurredAt || merchant === "图片账单") {
      unconfirmed += 1;
      continue;
    }
    const type = signedAmount >= 0 && /收益发放|退款|返现|收入|转入|工资|利息|结息/.test(
      `${merchant} ${line}`,
    )
      ? "收入"
      : "支出";
    const sourceCategory = lines
      .slice(index + 1, index + 3)
      .find(
        (candidate) =>
          candidate &&
          !ocrMoneyMatches(candidate).length &&
          !ocrDateFromLine(candidate, context, referenceDate) &&
          /餐饮|食品|酒饮|交通|出行|商业|理财|医疗|网购|消费|便利|服务/.test(candidate),
      ) ?? "";
    const amount = Math.abs(signedAmount);
    const identity = `${source.id}|${occurredAt}|${type}|${amount.toFixed(2)}|${merchant}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    items.push({
      occurredAt,
      merchant,
      amount,
      type,
      source: source.id,
      sourceName,
      sourceCategory,
      category: categoryFor(merchant, sourceCategory),
      incomeCategory: incomeCategoryFor(merchant, sourceCategory),
      paymentMethod: source.paymentMethod,
      status: "图片识别",
      externalId: identity,
      currency: "CNY",
    });
  }
  if (!items.length) {
    if (/月度账单/.test(allText) && /支出/.test(allText))
      throw new Error("这张图片只有月度汇总，没有逐笔流水，请上传交易明细截图");
    throw new Error("图片中没有识别到可确认的日期、商户和金额");
  }
  return {
    source: source.id,
    sourceName,
    items,
    skipped: filtered + unconfirmed,
    filtered,
    unconfirmed,
    truncated: 0,
    totalRows: items.length + filtered + unconfirmed,
  };
}

export function statementAccountKey(item) {
  return `${cleanCell(item?.paymentMethod)}\u0000${cleanCell(item?.currency || "CNY")}`;
}

export function partitionStatementImports(items) {
  const automatic = [];
  const review = [];
  for (const item of items) {
    if (Number(item?.accountId) > 0 && !item?.possibleDuplicate)
      automatic.push(item);
    else review.push(item);
  }
  return { automatic, review };
}

export function suggestStatementAccount(
  paymentMethod,
  sourceName,
  currency = "CNY",
) {
  const method = cleanCell(paymentMethod);
  const source = cleanCell(sourceName);
  const genericMethod =
    !method || /待选择账户|通用账单|银行 PDF|图片账单/.test(method);
  const baseName = genericMethod ? source || "账单导入账户" : method;
  return {
    name: baseName.slice(0, 30),
    type: /信用卡|贷记卡|花呗|白条|月付/.test(`${method} ${source}`)
      ? "负债"
      : "资产",
    currency: ["CNY", "USD", "JPY", "EUR"].includes(currency)
      ? currency
      : "CNY",
  };
}

export function matchStatementAccount(
  paymentMethod,
  source,
  accounts,
  currency = "CNY",
) {
  const method = cleanCell(paymentMethod);
  const all = accounts.filter(
    (account) => !currency || account.currency === currency,
  );
  const assets = all.filter((account) => account.type === "资产");
  const liabilities = all.filter((account) => account.type === "负债");
  const unique = (rows) => (rows.length === 1 ? rows[0] : null);
  const keywordGroups = [
    [/花呗/, ["花呗"]],
    [/白条/, ["白条", "京东"]],
    [/美团月付|月付/, ["美团月付", "月付", "美团"]],
    [/微信|零钱|财付通/, ["微信", "零钱"]],
    [/支付宝|余额宝/, ["支付宝", "余额宝"]],
    [/招商|招行/, ["招商", "招行"]],
    [/建设|建行/, ["建设", "建行"]],
    [/中国银行/, ["中国银行", "中行"]],
    [/农业银行/, ["农业银行", "农行"]],
    [/工商银行/, ["工商银行", "工行"]],
    [/交通银行/, ["交通银行", "交行"]],
  ];
  const accountDigits = method.match(/(?:\((\d{4})\)|(?:尾号|末四位|卡号)[^\d]{0,4}(\d{4}))/);
  const lastFour = accountDigits?.[1] || accountDigits?.[2];
  if (lastFour) {
    const identity = keywordGroups.find(([pattern]) =>
      pattern.test(`${method} ${source}`),
    );
    const exactDigits = unique(
      all.filter(
        (account) =>
          account.name.includes(lastFour) &&
          (!identity ||
            identity[1].some((name) => account.name.includes(name))),
      ),
    );
    if (exactDigits) return exactDigits;
    return null;
  }
  const normalizedMethod = method.replace(/[\s()（）*·-]/g, "").toLowerCase();
  if (normalizedMethod.length >= 2) {
    const exactName = unique(
      all.filter((account) => {
        const normalizedName = cleanCell(account.name)
          .replace(/[\s()（）*·-]/g, "")
          .toLowerCase();
        return (
          normalizedName === normalizedMethod ||
          normalizedName.includes(normalizedMethod) ||
          normalizedMethod.includes(normalizedName)
        );
      }),
    );
    if (exactName) return exactName;
  }
  const preferredPool = /信用卡|花呗|白条|月付/.test(method)
    ? liabilities
    : /储蓄卡|借记卡|余额|零钱/.test(method)
      ? assets
      : all;
  for (const [pattern, names] of keywordGroups) {
    if (!pattern.test(`${method} ${source}`)) continue;
    const matched = unique(
      preferredPool.filter((account) =>
        names.some((name) => account.name.includes(name)),
      ),
    );
    if (matched) return matched;
  }
  return null;
}
