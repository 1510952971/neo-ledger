class SessionUser {
  const SessionUser({
    required this.username,
    required this.displayName,
    this.avatarUrl,
  });

  final String username;
  final String displayName;
  final String? avatarUrl;

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
    username: '${json['username'] ?? ''}',
    displayName: '${json['displayName'] ?? json['username'] ?? '用户'}',
    avatarUrl: json['avatarUrl'] as String?,
  );
}

class Ledger {
  const Ledger({
    required this.id,
    required this.name,
    this.icon = '📒',
    this.updatedAt,
  });

  final int id;
  final String name;
  final String icon;
  final String? updatedAt;

  factory Ledger.fromJson(Map<String, dynamic> json) => Ledger(
    id: _asInt(json['id']),
    name: '${json['name'] ?? '未命名账本'}',
    icon: '${json['icon'] ?? '📒'}',
    updatedAt: json['updatedAt'] as String?,
  );
}

class Account {
  const Account({
    required this.id,
    required this.ledgerId,
    required this.name,
    required this.type,
    required this.balanceCents,
    this.currency = 'CNY',
    this.icon = '💰',
    this.updatedAt,
    this.isInvestment = false,
    this.assetClass = '现金流',
    this.billDay,
    this.repaymentDay,
  });

  final int id;
  final int ledgerId;
  final String name;
  final String type;
  final int balanceCents;
  final String currency;
  final String icon;
  final String? updatedAt;
  final bool isInvestment;
  final String assetClass;
  final int? billDay;
  final int? repaymentDay;

  factory Account.fromJson(Map<String, dynamic> json) => Account(
    id: _asInt(json['id']),
    ledgerId: _asInt(json['ledgerId'] ?? json['ledger_id']),
    name: '${json['name'] ?? '账户'}',
    type: '${json['type'] ?? '资产'}',
    balanceCents: _asInt(
      json['currentBalance'] ?? json['current_balance'] ?? json['balance'],
    ),
    currency: '${json['currency'] ?? 'CNY'}',
    icon: '${json['icon'] ?? '💰'}',
    updatedAt: json['updatedAt'] as String? ?? json['updated_at'] as String?,
    isInvestment: json['isInvestment'] == true || json['is_investment'] == 1,
    assetClass: '${json['assetClass'] ?? json['asset_class'] ?? '现金流'}',
    billDay: json['billDay'] == null && json['bill_day'] == null
        ? null
        : _asInt(json['billDay'] ?? json['bill_day']),
    repaymentDay: json['repaymentDay'] == null && json['repayment_day'] == null
        ? null
        : _asInt(json['repaymentDay'] ?? json['repayment_day']),
  );
}

class Member {
  const Member({
    required this.id,
    required this.ledgerId,
    required this.name,
    this.icon = '👤',
    this.isMe = false,
    this.createdAt,
  });

  final int id;
  final int ledgerId;
  final String name;
  final String icon;
  final bool isMe;
  final String? createdAt;

  factory Member.fromJson(Map<String, dynamic> json) => Member(
    id: _asInt(json['id']),
    ledgerId: _asInt(json['ledgerId'] ?? json['ledger_id']),
    name: '${json['name'] ?? '参与人'}',
    icon: '${json['icon'] ?? '👤'}',
    isMe: json['isMe'] == true || json['is_me'] == true || json['isMe'] == 1,
    createdAt: json['createdAt'] as String? ?? json['created_at'] as String?,
  );
}

class Category {
  const Category({
    required this.id,
    required this.ledgerId,
    required this.name,
    this.icon = '🧾',
    this.color = '#6B7280',
    this.builtinKey,
    this.isSystem = false,
    this.isActive = true,
    this.sortOrder = 0,
    this.createdAt,
  });

  final int id;
  final int ledgerId;
  final String name;
  final String icon;
  final String color;
  final String? builtinKey;
  final bool isSystem;
  final bool isActive;
  final int sortOrder;
  final String? createdAt;

  factory Category.fromJson(Map<String, dynamic> json) => Category(
    id: _asInt(json['id']),
    ledgerId: _asInt(json['ledgerId'] ?? json['ledger_id']),
    name: '${json['name'] ?? '未命名分类'}',
    icon: '${json['icon'] ?? '🧾'}',
    color: '${json['color'] ?? '#6B7280'}',
    builtinKey: json['builtinKey'] as String? ?? json['builtin_key'] as String?,
    isSystem: _asBool(json['isSystem'] ?? json['is_system']),
    isActive: json['isActive'] == null && json['is_active'] == null
        ? true
        : _asBool(json['isActive'] ?? json['is_active']),
    sortOrder: _asInt(json['sortOrder'] ?? json['sort_order']),
    createdAt: json['createdAt'] as String? ?? json['created_at'] as String?,
  );

  Category copyWith({
    String? name,
    String? icon,
    String? color,
    bool? isActive,
    int? sortOrder,
  }) => Category(
    id: id,
    ledgerId: ledgerId,
    name: name ?? this.name,
    icon: icon ?? this.icon,
    color: color ?? this.color,
    builtinKey: builtinKey,
    isSystem: isSystem,
    isActive: isActive ?? this.isActive,
    sortOrder: sortOrder ?? this.sortOrder,
    createdAt: createdAt,
  );
}

class Preferences {
  const Preferences({this.theme = 'cream', this.lockEnabled = false});

  final String theme;
  final bool lockEnabled;

  factory Preferences.fromJson(Map<String, dynamic> json) => Preferences(
    theme: '${json['theme'] ?? 'cream'}',
    lockEnabled: _asBool(json['lockEnabled'] ?? json['enabled']),
  );
}

class AiReply {
  const AiReply({
    required this.answer,
    required this.provider,
    this.context = const {},
  });

  final String answer;
  final String provider;
  final Map<String, dynamic> context;

  factory AiReply.fromJson(Map<String, dynamic> json) => AiReply(
    answer: '${json['answer'] ?? ''}',
    provider: '${json['provider'] ?? 'local-rules'}',
    context: _asMap(json['context']),
  );
}

class TransactionItem {
  const TransactionItem({
    required this.id,
    this.ledgerId = 0,
    this.accountId = 0,
    required this.title,
    required this.amountCents,
    required this.type,
    required this.occurredAt,
    this.category,
    this.incomeCategory,
    this.mood,
    this.originalTimezone = 'Asia/Shanghai',
    this.updatedAt,
    this.installmentId,
    this.accountName,
    this.currency = 'CNY',
    this.source = '账本',
  });

  final int id;
  final int ledgerId;
  final int accountId;
  final String title;
  final int amountCents;
  final String type;
  final String occurredAt;
  final String? category;
  final String? incomeCategory;
  final String? mood;
  final String originalTimezone;
  final String? updatedAt;
  final int? installmentId;
  final String? accountName;
  final String currency;
  final String source;

  bool get isIncome => type == '收入';
  double get amount => amountCents / 100;

  TransactionItem copyWith({
    String? title,
    int? amountCents,
    String? type,
    String? occurredAt,
    String? category,
    String? incomeCategory,
    String? mood,
    int? accountId,
    String? accountName,
    String? updatedAt,
  }) => TransactionItem(
    id: id,
    ledgerId: ledgerId,
    accountId: accountId ?? this.accountId,
    title: title ?? this.title,
    amountCents: amountCents ?? this.amountCents,
    type: type ?? this.type,
    occurredAt: occurredAt ?? this.occurredAt,
    category: category ?? this.category,
    incomeCategory: incomeCategory ?? this.incomeCategory,
    mood: mood ?? this.mood,
    originalTimezone: originalTimezone,
    updatedAt: updatedAt ?? this.updatedAt,
    installmentId: installmentId,
    accountName: accountName ?? this.accountName,
    currency: currency,
    source: source,
  );

  factory TransactionItem.fromJson(
    Map<String, dynamic> json,
  ) => TransactionItem(
    id: _asInt(json['id']),
    ledgerId: _asInt(json['ledgerId'] ?? json['ledger_id']),
    accountId: _asInt(json['accountId'] ?? json['account_id']),
    title: '${json['title'] ?? '未命名流水'}',
    amountCents: _asInt(json['amount']),
    type: '${json['type'] ?? '支出'}',
    occurredAt: '${json['occurredAt'] ?? json['occurred_at'] ?? ''}',
    category: (json['category'] ?? json['categoryDynamic']) as String?,
    incomeCategory:
        (json['incomeCategory'] ??
                json['income_category'] ??
                json['incomeCategoryDynamic'])
            as String?,
    mood: json['mood'] as String?,
    originalTimezone:
        '${json['originalTimezone'] ?? json['original_timezone'] ?? 'Asia/Shanghai'}',
    updatedAt: json['updatedAt'] as String?,
    installmentId: json['installmentId'] == null
        ? null
        : _asInt(json['installmentId']),
    accountName: json['accountName'] as String?,
    currency: '${json['currency'] ?? 'CNY'}',
    source: '${json['source'] ?? '账本'}',
  );
}

class TransactionPage {
  const TransactionPage({
    required this.items,
    required this.total,
    required this.incomeCents,
    required this.expenseCents,
  });

  final List<TransactionItem> items;
  final int total;
  final int incomeCents;
  final int expenseCents;

  int get balanceCents => incomeCents - expenseCents;

  factory TransactionPage.fromJson(Map<String, dynamic> json) =>
      TransactionPage(
        items: ((json['items'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(TransactionItem.fromJson)
            .toList()),
        total: _asInt(json['total']),
        incomeCents: _asInt(json['income']),
        expenseCents: _asInt(json['expense']),
      );
}

class AnalysisBucket {
  const AnalysisBucket({required this.name, required this.amountCents});

  final String name;
  final int amountCents;

  factory AnalysisBucket.fromJson(Map<String, dynamic> json) => AnalysisBucket(
    name: '${json['name'] ?? json['label'] ?? '未分类'}',
    amountCents: _asInt(json['amount'] ?? json['value']),
  );
}

class AnalysisTrendPoint {
  const AnalysisTrendPoint({
    required this.label,
    required this.expenseCents,
    required this.incomeCents,
  });

  final String label;
  final int expenseCents;
  final int incomeCents;

  factory AnalysisTrendPoint.fromJson(Map<String, dynamic> json) =>
      AnalysisTrendPoint(
        label: '${json['label'] ?? json['name'] ?? ''}',
        expenseCents: _asInt(json['expense']),
        incomeCents: _asInt(json['income']),
      );
}

class AnalysisSummary {
  const AnalysisSummary({
    required this.incomeCents,
    required this.expenseCents,
    required this.balanceCents,
    required this.savingRate,
    required this.categoryData,
    required this.moodData,
    required this.incomeData,
    required this.trend,
    required this.impulseCents,
    required this.needExpenseCents,
    required this.investmentIncomeCents,
    this.topCategory,
  });

  final int incomeCents;
  final int expenseCents;
  final int balanceCents;
  final double savingRate;
  final List<AnalysisBucket> categoryData;
  final List<AnalysisBucket> moodData;
  final List<AnalysisBucket> incomeData;
  final List<AnalysisTrendPoint> trend;
  final int impulseCents;
  final int needExpenseCents;
  final int investmentIncomeCents;
  final AnalysisBucket? topCategory;

  factory AnalysisSummary.fromJson(Map<String, dynamic> json) {
    final analysis = _asMap(json['analysis']);
    final categories = _asMaps(analysis['categoryData'])
        .map(AnalysisBucket.fromJson)
        .toList();
    final top = _asMap(analysis['topCategory']);
    return AnalysisSummary(
      incomeCents: _asInt(analysis['incomeTotal']),
      expenseCents: _asInt(analysis['expenseTotal']),
      balanceCents: _asInt(analysis['balance']),
      savingRate: _asDouble(analysis['savingRate']),
      categoryData: categories,
      moodData: _asMaps(analysis['moodData'])
          .map(AnalysisBucket.fromJson)
          .toList(),
      incomeData: _asMaps(analysis['incomeData'])
          .map(AnalysisBucket.fromJson)
          .toList(),
      trend: _asMaps(analysis['trend'])
          .map(AnalysisTrendPoint.fromJson)
          .toList(),
      impulseCents: _asInt(analysis['impulse']),
      needExpenseCents: _asInt(analysis['needExpense']),
      investmentIncomeCents: _asInt(analysis['investmentIncome']),
      topCategory: top.isEmpty ? null : AnalysisBucket.fromJson(top),
    );
  }
}

class CategoryBudget {
  const CategoryBudget({
    required this.ledgerId,
    required this.category,
    required this.amountCents,
    this.updatedAt,
  });

  final int ledgerId;
  final String category;
  final int amountCents;
  final String? updatedAt;

  factory CategoryBudget.fromJson(Map<String, dynamic> json) => CategoryBudget(
    ledgerId: _asInt(json['ledgerId'] ?? json['ledger_id']),
    category: '${json['category'] ?? '其他'}',
    amountCents: _asInt(json['amount']),
    updatedAt: json['updatedAt'] as String?,
  );
}

class Subscription {
  const Subscription({
    required this.id,
    required this.name,
    required this.amountCents,
    required this.cycle,
    this.accountId = 0,
    this.category,
    this.nextChargeDate,
    this.updatedAt,
  });

  final int id;
  final String name;
  final int amountCents;
  final String cycle;
  final int accountId;
  final String? category;
  final String? nextChargeDate;
  final String? updatedAt;

  factory Subscription.fromJson(Map<String, dynamic> json) => Subscription(
    id: _asInt(json['id']),
    name: '${json['name'] ?? '固定订阅'}',
    amountCents: _asInt(json['amount']),
    cycle: '${json['cycle'] ?? '月'}',
    accountId: _asInt(json['accountId'] ?? json['account_id']),
    category: json['category'] as String?,
    nextChargeDate: json['nextChargeDate'] as String?,
    updatedAt: json['updatedAt'] as String?,
  );
}

class Installment {
  const Installment({
    required this.id,
    required this.name,
    required this.totalAmountCents,
    required this.periods,
    required this.paidPeriods,
    required this.feeAmountCents,
    this.accountId = 0,
    this.paymentAccountId = 0,
    this.startMonth,
    this.chargeDay = 1,
    this.updatedAt,
  });

  final int id;
  final String name;
  final int totalAmountCents;
  final int periods;
  final int paidPeriods;
  final int feeAmountCents;
  final int accountId;
  final int paymentAccountId;
  final String? startMonth;
  final int chargeDay;
  final String? updatedAt;

  int get remainingPeriods => (periods - paidPeriods).clamp(0, periods);

  factory Installment.fromJson(Map<String, dynamic> json) => Installment(
    id: _asInt(json['id']),
    name: '${json['name'] ?? '分期计划'}',
    totalAmountCents: _asInt(json['totalAmount']),
    periods: _asInt(json['periods']),
    paidPeriods: _asInt(json['paidPeriods']),
    feeAmountCents: _asInt(json['feeAmount']),
    accountId: _asInt(json['accountId'] ?? json['account_id']),
    paymentAccountId: _asInt(
      json['paymentAccountId'] ?? json['payment_account_id'],
    ),
    startMonth: json['startMonth'] as String?,
    chargeDay: _asInt(json['chargeDay']) == 0 ? 1 : _asInt(json['chargeDay']),
    updatedAt: json['updatedAt'] as String?,
  );
}

class SavingsGoal {
  const SavingsGoal({
    required this.id,
    required this.name,
    required this.targetAmountCents,
    required this.savedAmountCents,
    this.deadline,
    this.icon,
    this.updatedAt,
  });

  final int id;
  final String name;
  final int targetAmountCents;
  final int savedAmountCents;
  final String? deadline;
  final String? icon;
  final String? updatedAt;

  double get progress => targetAmountCents <= 0
      ? 0
      : (savedAmountCents / targetAmountCents).clamp(0, 1);

  factory SavingsGoal.fromJson(Map<String, dynamic> json) => SavingsGoal(
    id: _asInt(json['id']),
    name: '${json['name'] ?? '储蓄目标'}',
    targetAmountCents: _asInt(json['targetAmount']),
    savedAmountCents: _asInt(json['savedAmount']),
    deadline: json['deadline'] as String?,
    icon: json['icon'] as String?,
    updatedAt: json['updatedAt'] as String?,
  );
}

class ForecastPoint {
  const ForecastPoint({
    required this.label,
    required this.date,
    required this.balanceCents,
    required this.danger,
  });

  final String label;
  final String date;
  final int balanceCents;
  final bool danger;

  factory ForecastPoint.fromJson(Map<String, dynamic> json) => ForecastPoint(
    label: '${json['label'] ?? ''}',
    date: '${json['date'] ?? ''}',
    balanceCents: _asInt(json['balance']),
    danger: json['danger'] == true,
  );
}

class Forecast {
  const Forecast({
    required this.netWorthCents,
    required this.averageDailySpendCents,
    required this.monthlyFixedCents,
    required this.runwayDays,
    required this.hasSpendingData,
    required this.points,
    this.bankruptcyDate,
  });

  final int netWorthCents;
  final int averageDailySpendCents;
  final int monthlyFixedCents;
  final int runwayDays;
  final bool hasSpendingData;
  final List<ForecastPoint> points;
  final String? bankruptcyDate;

  factory Forecast.fromJson(Map<String, dynamic> json) => Forecast(
    netWorthCents: _asInt(json['netWorth']),
    averageDailySpendCents: _asInt(json['averageDailySpend']),
    monthlyFixedCents: _asInt(json['monthlyFixed']),
    runwayDays: _asInt(json['runwayDays']),
    hasSpendingData: json['hasSpendingData'] == true,
    points: _asMaps(json['points']).map(ForecastPoint.fromJson).toList(),
    bankruptcyDate: json['bankruptcyDate'] as String?,
  );
}

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.title,
    required this.message,
    required this.read,
    required this.createdAt,
  });

  final int id;
  final String title;
  final String message;
  final bool read;
  final String createdAt;

  NotificationItem copyWith({bool? read}) => NotificationItem(
    id: id,
    title: title,
    message: message,
    read: read ?? this.read,
    createdAt: createdAt,
  );

  factory NotificationItem.fromJson(Map<String, dynamic> json) =>
      NotificationItem(
        id: _asInt(json['id']),
        title: '${json['title'] ?? '系统通知'}',
        message: '${json['message'] ?? ''}',
        read: json['read'] == true || json['read'] == 1,
        createdAt: '${json['createdAt'] ?? json['created_at'] ?? ''}',
      );
}

class PendingTransaction {
  const PendingTransaction({
    required this.id,
    required this.title,
    required this.amountCents,
    required this.type,
    required this.occurredAt,
    required this.status,
    this.accountId = 0,
    this.currency = 'CNY',
    this.accountName,
    this.rawText,
    this.createdAt,
    this.suggestion,
  });

  final int id;
  final String title;
  final int amountCents;
  final String type;
  final String occurredAt;
  final String status;
  final int accountId;
  final String currency;
  final String? accountName;
  final String? rawText;
  final String? createdAt;
  final String? suggestion;

  factory PendingTransaction.fromJson(Map<String, dynamic> json) =>
      PendingTransaction(
        id: _asInt(json['id']),
        title: '${json['title'] ?? '待处理账单'}',
        amountCents: _asInt(json['amount']),
        type: '${json['type'] ?? '支出'}',
        occurredAt: '${json['occurredAt'] ?? json['occurred_at'] ?? ''}',
        status: '${json['status'] ?? 'pending'}',
        accountId: _asInt(json['accountId'] ?? json['account_id']),
        currency: '${json['currency'] ?? 'CNY'}',
        accountName: json['accountName'] as String?,
        rawText: json['rawText'] as String?,
        createdAt: json['createdAt'] as String?,
        suggestion: _asMap(json['automationSuggestion'])['category'] as String?,
      );
}

class PendingTransactionPage {
  const PendingTransactionPage({
    required this.items,
    required this.total,
    required this.hasMore,
  });

  final List<PendingTransaction> items;
  final int total;
  final bool hasMore;
}

class DigitalAsset {
  const DigitalAsset({
    required this.id,
    required this.name,
    required this.assetType,
    required this.currency,
    required this.valueCents,
    required this.purchasePriceCents,
    this.valuationMode,
    this.updatedAt,
    this.currentValueCents,
    this.residualValueCents,
    this.monthlyDepreciationCents,
    this.purchaseDate,
    this.lifespanMonths = 120,
    this.residualRate = 0,
  });

  final int id;
  final String name;
  final String assetType;
  final String currency;
  final int valueCents;
  final int purchasePriceCents;
  final String? valuationMode;
  final String? updatedAt;
  final int? currentValueCents;
  final int? residualValueCents;
  final int? monthlyDepreciationCents;
  final String? purchaseDate;
  final int lifespanMonths;
  final double residualRate;

  factory DigitalAsset.fromJson(Map<String, dynamic> json) => DigitalAsset(
    id: _asInt(json['id']),
    name: '${json['name'] ?? '资产'}',
    assetType: '${json['assetType'] ?? json['asset_type'] ?? '其他'}',
    currency: '${json['currency'] ?? 'CNY'}',
    valueCents: _asInt(
      json['currentValue'] ?? json['manualValue'] ?? json['manual_value'],
    ),
    purchasePriceCents: _asInt(json['purchasePrice'] ?? json['purchase_price']),
    valuationMode: json['valuationMode'] as String?,
    updatedAt: json['updatedAt'] as String?,
    currentValueCents: json['currentValue'] == null
        ? null
        : _asInt(json['currentValue']),
    residualValueCents: json['residualValue'] == null
        ? null
        : _asInt(json['residualValue']),
    monthlyDepreciationCents: json['monthlyDepreciation'] == null
        ? null
        : _asInt(json['monthlyDepreciation']),
    purchaseDate: json['purchaseDate'] as String?,
    lifespanMonths: _asInt(json['lifespanMonths']) == 0
        ? 120
        : _asInt(json['lifespanMonths']),
    residualRate: _asInt(json['residualRateBps']) / 100,
  );
}

class OfflineEntry {
  const OfflineEntry({
    required this.offlineId,
    required this.ledgerId,
    required this.accountId,
    required this.amount,
    required this.type,
    required this.title,
    required this.category,
    required this.occurredAt,
  });

  final String offlineId;
  final int ledgerId;
  final int accountId;
  final double amount;
  final String type;
  final String title;
  final String category;
  final String occurredAt;

  Map<String, dynamic> toJson() => {
    'offlineId': offlineId,
    'ledgerId': ledgerId,
    'accountId': accountId,
    'amount': amount,
    'type': type,
    'title': title,
    'category': category,
    'mood': '刚需',
    'originalTimezone': 'Asia/Shanghai',
    'occurredAt': occurredAt,
  };

  factory OfflineEntry.fromJson(Map<String, dynamic> json) => OfflineEntry(
    offlineId: '${json['offlineId']}',
    ledgerId: _asInt(json['ledgerId']),
    accountId: _asInt(json['accountId']),
    amount: (json['amount'] as num?)?.toDouble() ?? 0,
    type: '${json['type'] ?? '支出'}',
    title: '${json['title'] ?? '离线记账'}',
    category: '${json['category'] ?? '餐饮'}',
    occurredAt: '${json['occurredAt'] ?? ''}',
  );
}

class UpdateInfo {
  const UpdateInfo({
    required this.version,
    required this.tagName,
    required this.releaseUrl,
    required this.notes,
    required this.assets,
    this.publishedAt,
  });

  final String version;
  final String tagName;
  final String releaseUrl;
  final String notes;
  final Map<String, String> assets;
  final String? publishedAt;

  factory UpdateInfo.fromGitHub(Map<String, dynamic> json) {
    final tag = '${json['tag_name'] ?? ''}';
    final version = tag.startsWith('native-v')
        ? tag.substring('native-v'.length)
        : tag;
    final rawAssets = (json['assets'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>();
    return UpdateInfo(
      version: version,
      tagName: tag,
      releaseUrl: '${json['html_url'] ?? ''}',
      notes: '${json['body'] ?? ''}'.trim(),
      publishedAt: json['published_at'] as String?,
      assets: {
        for (final asset in rawAssets)
          if (asset['name'] != null && asset['browser_download_url'] != null)
            '${asset['name']}': '${asset['browser_download_url']}',
      },
    );
  }

  MapEntry<String, String>? _preferredAsset(String platform) {
    final matches = assets.entries
        .where(
          (entry) => entry.key.toLowerCase().contains(platform.toLowerCase()),
        )
        .toList();
    if (matches.isEmpty) return null;
    int rank(String name) {
      final normalized = name.toLowerCase();
      return switch (platform) {
        'android' =>
          normalized.endsWith('.apk')
              ? 0
              : normalized.endsWith('.aab')
              ? 1
              : 10,
        'windows' =>
          normalized.endsWith('.msix') || normalized.endsWith('.msixbundle')
              ? 0
              : normalized.endsWith('.exe')
              ? 1
              : normalized.endsWith('.zip')
              ? 2
              : 10,
        'web' => normalized.endsWith('.tar.gz') ? 0 : 10,
        'ios' => normalized.contains('unsigned') ? 10 : 0,
        _ => 10,
      };
    }

    matches.sort((a, b) => rank(a.key).compareTo(rank(b.key)));
    return matches.first;
  }

  String? assetFor(String platform) => _preferredAsset(platform)?.value;

  String? assetNameFor(String platform) => _preferredAsset(platform)?.key;

  String? get checksumManifestUrl {
    for (final entry in assets.entries) {
      final name = entry.key.toLowerCase();
      if (name == 'sha256sums.txt' || name.endsWith('/sha256sums.txt')) {
        return entry.value;
      }
    }
    return null;
  }

  bool isNewerThan(String current) => _compareVersions(version, current) > 0;
}

int _asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse('$value') ?? 0;
}

bool _asBool(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  final normalized = '$value'.toLowerCase();
  return normalized == 'true' || normalized == '1' || normalized == 'yes';
}

double _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is! Map) return <String, dynamic>{};
  return value.map((key, value) => MapEntry('$key', value));
}

List<Map<String, dynamic>> _asMaps(Object? value) {
  if (value is! List) return const <Map<String, dynamic>>[];
  return value.whereType<Map>().map(_asMap).toList();
}

int _compareVersions(String left, String right) {
  List<int> parse(String value) => value
      .split(RegExp(r'[+\-]'))
      .first
      .split('.')
      .map((part) => int.tryParse(part) ?? 0)
      .toList();
  final a = parse(left);
  final b = parse(right);
  for (var i = 0; i < 3; i++) {
    final result = (a.length > i ? a[i] : 0).compareTo(b.length > i ? b[i] : 0);
    if (result != 0) return result;
  }
  return 0;
}
