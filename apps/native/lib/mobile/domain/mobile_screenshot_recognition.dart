import '../../shortcut_entry.dart';

/// Result of on-device OCR and conservative, review-only field extraction.
/// The score is a field-completeness indicator, not an ML confidence value.
class MobileScreenshotRecognition {
  const MobileScreenshotRecognition({
    required this.originalText,
    required this.redactedText,
    required this.type,
    required this.typeWasInferred,
    required this.fieldCompleteness,
    this.amount,
    this.merchant,
    this.occurredAt,
  });

  final String originalText;
  final String redactedText;
  final double? amount;
  final String? merchant;
  final DateTime? occurredAt;
  final String type;
  final bool typeWasInferred;
  final int fieldCompleteness;

  ShortcutEntryDraft? toDraft({String? category}) {
    final value = amount;
    if (value == null || value <= 0) return null;
    return ShortcutEntryDraft(
      amount: value,
      title: merchant?.trim().isNotEmpty == true ? merchant!.trim() : '截图识别账单',
      category: category?.trim().isNotEmpty == true ? category!.trim() : '其他',
      type: type,
      occurredAt: occurredAt,
      source: '截图本地识别',
      recognitionText: redactedText,
      recognitionCompleteness: fieldCompleteness,
      recognizedFields: {
        if (amount != null) 'amount': amount,
        if (merchant != null) 'title': merchant,
        'type': type,
        if (occurredAt != null) 'occurredAt': occurredAt!.toIso8601String(),
      },
    );
  }
}

MobileScreenshotRecognition parseMobileScreenshotText(String rawText) {
  final original = rawText.trim();
  final redacted = redactMobileScreenshotText(original);
  final amount = _extractAmount(redacted);
  final merchant = _extractLabeledValue(redacted, const [
    '商户名称',
    '商户',
    '收款方',
    '付款方',
    '店铺名称',
    '店铺',
    '商家',
  ]);
  final occurredAt = _extractDate(redacted);
  final incomeSignal = RegExp(r'收款成功|收款金额|入账|到账|收入|退款成功').hasMatch(redacted);
  final expenseSignal = RegExp(r'支付成功|付款成功|支付金额|付款金额|消费金额|扣款')
      .hasMatch(redacted);
  final typeInferred = incomeSignal == expenseSignal;
  final type = incomeSignal && !expenseSignal ? '收入' : '支出';
  final score =
      (amount == null ? 0 : 40) +
      (merchant == null ? 0 : 25) +
      (occurredAt == null ? 0 : 20) +
      (typeInferred ? 10 : 15);

  return MobileScreenshotRecognition(
    originalText: original,
    redactedText: redacted,
    amount: amount,
    merchant: merchant,
    occurredAt: occurredAt,
    type: type,
    typeWasInferred: typeInferred,
    fieldCompleteness: score,
  );
}

String redactMobileScreenshotText(String text) {
  var value = text;
  value = value.replaceAllMapped(
    RegExp(
      r'(?:订单号|交易单号|交易号|流水号|参考号|商户单号)\s*[:：]?\s*[A-Za-z0-9_-]{6,}',
      caseSensitive: false,
    ),
    (match) => _keepLabel(match.group(0)!, '[编号已隐藏]'),
  );
  value = value.replaceAllMapped(
    RegExp(r'(?:详细地址|收货地址|联系地址|门店地址|地址)\s*[:：]?\s*[^\r\n]+'),
    (match) => _keepLabel(match.group(0)!, '[地址已隐藏]'),
  );
  value = value.replaceAll(RegExp(r'(?<!\d)\d{17}[0-9Xx](?!\d)'), '[证件号已隐藏]');
  value = value.replaceAll(
    RegExp(r'(?<!\d)(?:\d[ -]?){15,18}\d(?!\d)'),
    '[卡号已隐藏]',
  );
  value = value.replaceAll(RegExp(r'(?<!\d)1[3-9]\d{9}(?!\d)'), '[手机号已隐藏]');
  return value;
}

String _keepLabel(String value, String replacement) {
  final label = RegExp(r'^(?:订单号|交易单号|交易号|流水号|参考号|商户单号|详细地址|收货地址|联系地址|门店地址|地址)')
      .firstMatch(value)
      ?.group(0);
  return '${label ?? '隐私信息'}：$replacement';
}

double? _extractAmount(String text) {
  final labeled = RegExp(
    r'(?:实付(?:金额)?|支付金额|付款金额|消费金额|交易金额|合计|总计|金额)\s*[:：]?\s*(?:CNY|RMB|¥|￥)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)',
    caseSensitive: false,
  ).firstMatch(text);
  final currency = RegExp(r'(?:¥|￥)\s*(-?\d[\d,]*(?:\.\d{1,2})?)')
      .firstMatch(text);
  final raw = labeled?.group(1) ?? currency?.group(1);
  if (raw == null) return null;
  final value = double.tryParse(raw.replaceAll(',', ''));
  if (value == null || !value.isFinite || value <= 0 || value > 100000000) {
    return null;
  }
  return value;
}

String? _extractLabeledValue(String text, List<String> labels) {
  final alternatives = labels.map(RegExp.escape).join('|');
  final match = RegExp('(?:$alternatives)\\s*[:：]?\\s*([^\\r\\n]{1,80})')
      .firstMatch(text);
  final value = match?.group(1)?.trim().replaceAll(RegExp(r'\s{2,}'), ' ');
  if (value == null || value.isEmpty || value.startsWith('[')) return null;
  return value;
}

DateTime? _extractDate(String text) {
  final match = RegExp(r'(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})日?')
      .firstMatch(text);
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final date = DateTime(year, month, day);
  if (date.year != year || date.month != month || date.day != day) return null;
  return date;
}
