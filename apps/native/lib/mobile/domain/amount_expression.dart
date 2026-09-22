/// Small deterministic calculator used by the mobile bookkeeping keypad.
///
/// Only addition and subtraction are accepted intentionally: this covers the
/// common "12.5 + 3" workflow without turning amount entry into a general
/// expression parser. Values are kept in cents to avoid floating point drift.
class AmountExpression {
  const AmountExpression._();

  static const int maximumCents = 99999999999;

  static int? evaluateCents(String input) {
    final compact = input.replaceAll(' ', '');
    if (compact.isEmpty || compact.endsWith('+') || compact.endsWith('-')) {
      return null;
    }
    if (!RegExp(r'^\d+(?:\.\d{0,2})?(?:[+-]\d+(?:\.\d{0,2})?)*$')
        .hasMatch(compact)) {
      return null;
    }
    final tokens = RegExp(r'([+-]?)(\d+(?:\.\d{0,2})?)')
        .allMatches(compact)
        .toList();
    if (tokens.isEmpty ||
        tokens.map((match) => match.group(0)).join() != compact) {
      return null;
    }
    var total = 0;
    for (final token in tokens) {
      final cents = _parseCents(token.group(2)!);
      if (cents == null) return null;
      total += token.group(1) == '-' ? -cents : cents;
      if (total.abs() > maximumCents) return null;
    }
    return total > 0 ? total : null;
  }

  static bool canAppend(String current, String key) {
    if (key == '+' || key == '-') {
      return current.isNotEmpty &&
          !current.endsWith('+') &&
          !current.endsWith('-') &&
          !current.endsWith('.');
    }
    final tail = current.split(RegExp(r'[+-]')).last;
    if (key == '.') return tail.isNotEmpty && !tail.contains('.');
    final decimals = tail.contains('.') ? tail.split('.').last.length : 0;
    return decimals < 2 && current.length < 24;
  }

  static int? _parseCents(String value) {
    final parts = value.split('.');
    final units = int.tryParse(parts.first);
    if (units == null) return null;
    final fraction = parts.length == 1
        ? 0
        : int.tryParse(parts.last.padRight(2, '0'));
    if (fraction == null) return null;
    return units * 100 + fraction;
  }
}
