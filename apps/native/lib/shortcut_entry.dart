class ShortcutEntryDraft {
  const ShortcutEntryDraft({
    required this.amount,
    required this.title,
    required this.category,
    required this.type,
    this.occurredAt,
    required this.source,
  });

  final double amount;
  final String title;
  final String category;
  final String type;
  final DateTime? occurredAt;
  final String source;
}

ShortcutEntryDraft? parseShortcutEntryUri(String raw) {
  final uri = Uri.tryParse(raw.trim());
  if (uri == null ||
      uri.scheme.toLowerCase() != 'neoledger' ||
      uri.host.toLowerCase() != 'entry' ||
      (uri.path.isNotEmpty && uri.path != '/')) {
    return null;
  }

  final amountText = uri.queryParameters['amount']?.trim();
  final amount = amountText == null ? null : double.tryParse(amountText);
  if (amount == null ||
      !amount.isFinite ||
      amount <= 0 ||
      amount > 100000000) {
    return null;
  }

  final type = _normalizeType(uri.queryParameters['type']);
  if (type == null) return null;

  final occurredAtText = uri.queryParameters['occurredAt'];
  final occurredAt = _parseOccurredAt(occurredAtText);
  if (occurredAtText != null && occurredAt == null) return null;

  final title = _boundedValue(
    uri.queryParameters['title'],
    fallback: '快捷指令流水',
    maxLength: 120,
  );
  final category = _boundedValue(
    uri.queryParameters['category'],
    fallback: '其他',
    maxLength: 60,
  );
  final source = _boundedValue(
    uri.queryParameters['source'],
    fallback: 'iOS 快捷指令',
    maxLength: 60,
  );
  if (title == null || category == null || source == null) return null;

  return ShortcutEntryDraft(
    amount: amount,
    title: title,
    category: category,
    type: type,
    occurredAt: occurredAt,
    source: source,
  );
}

String? _boundedValue(
  String? raw, {
  required String fallback,
  required int maxLength,
}) {
  final normalized = raw?.trim();
  if (normalized == null || normalized.isEmpty) return fallback;
  if (normalized.length > maxLength) return null;
  return normalized;
}

String? _normalizeType(String? raw) {
  switch (raw?.trim().toLowerCase()) {
    case '支出':
    case 'expense':
    case 'expenses':
    case 'outcome':
      return '支出';
    case '收入':
    case 'income':
    case 'incomes':
    case 'revenue':
      return '收入';
    default:
      return null;
  }
}

DateTime? _parseOccurredAt(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final normalized = raw.trim();
  if (!RegExp(r'(?:[zZ]|[+-]\d{2}:?\d{2})$').hasMatch(normalized)) {
    return null;
  }
  final parsed = DateTime.tryParse(normalized);
  return parsed?.toUtc();
}
