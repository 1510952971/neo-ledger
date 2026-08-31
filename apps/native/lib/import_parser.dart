import 'dart:convert';

/// Normalizes the small set of import formats accepted by the native client.
///
/// The server remains the source of truth for duplicate detection, account
/// mapping, and the final import. This class only turns JSON/CSV text into the
/// canonical transaction payload used by the preview endpoint.
class LedgerImportParser {
  static List<Map<String, dynamic>> parse(
    String input, {
    DateTime? now,
  }) {
    final text = input.replaceFirst('\uFEFF', '').trim();
    if (text.isEmpty) throw const FormatException('文件为空');

    final fallbackNow = now ?? DateTime.now();
    if (text.startsWith('[') || text.startsWith('{')) {
      dynamic decoded;
      try {
        decoded = jsonDecode(text);
      } catch (error) {
        throw FormatException('JSON 解析失败：$error');
      }
      return _parseJson(decoded, fallbackNow);
    }
    return _parseCsv(text, fallbackNow);
  }

  static List<Map<String, dynamic>> _parseJson(
    dynamic decoded,
    DateTime fallbackNow,
  ) {
    final container = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : null;
    final rawItems = decoded is List
        ? decoded
        : container?['items'] ??
            container?['transactions'] ??
            container?['data'];
    // The Web export keeps transaction amounts in cents. Only treat a
    // versioned export containing the transactions array as that format;
    // arbitrary user JSON with a `title` field must remain in yuan.
    final fromWebExport = container?['version'] != null &&
        container?['transactions'] is List &&
        identical(rawItems, container?['transactions']);
    if (rawItems is! List) {
      throw const FormatException(
        'JSON 必须是流水数组，或包含 items/transactions/data 数组',
      );
    }
    return rawItems
        .whereType<Map>()
        .map(
          (value) => _normalizeRecord(
            Map<String, dynamic>.from(value),
            fallbackNow: fallbackNow,
            useFallbackDate: true,
            fromWebExport: fromWebExport,
          ),
        )
        .toList();
  }

  static List<Map<String, dynamic>> _parseCsv(
    String text,
    DateTime fallbackNow,
  ) {
    final rows = _parseCsvRows(text)
        .where((row) => row.any((cell) => cell.trim().isNotEmpty))
        .toList();
    if (rows.length < 2) {
      throw const FormatException('CSV 至少需要一行表头和一行流水');
    }

    final headers = rows.first.map(_normalizeHeader).toList();
    if (headers.every((header) => header.isEmpty)) {
      throw const FormatException('CSV 表头为空');
    }

    final corpus = rows.take(4).expand((row) => row).join(' ');
    final inferredSource = _inferSource(corpus);
    return rows
        .skip(1)
        .where((row) => row.any((cell) => cell.trim().isNotEmpty))
        .map((row) {
          final source = _value(row, headers, const {
            'source',
            '来源',
            '平台',
            '应用',
            '应用名称',
          });
          final record = <String, dynamic>{
            'occurredAt': _value(row, headers, const {
              'occurredat',
              'occurred_at',
              'date',
              '日期',
              '时间',
              '交易时间',
              '发生时间',
            }),
            'merchant': _value(row, headers, const {
              'merchant',
              '商户',
              '商户名称',
              '交易对方',
              '名称',
              '商品',
              '标题',
              'title',
            }),
            'amount': _value(row, headers, const {
              'amount',
              '金额',
              '交易金额',
              '实付金额',
              '订单金额',
              '金额(元)',
              '金额（元）',
            }),
            'type': _value(row, headers, const {
              'type',
              '类型',
              '收支',
              '收支类型',
              '借贷标志',
              '收/支',
            }),
            'source': source.isEmpty ? inferredSource : source,
            'sourceName': source.isEmpty ? inferredSource : source,
            'sourceCategory': _value(row, headers, const {
              'sourcecategory',
              '来源分类',
            }),
            'category': _value(row, headers, const {
              'category',
              '分类',
              '交易分类',
              '消费分类',
            }),
            'incomeCategory': _value(row, headers, const {
              'incomecategory',
              '收入分类',
            }),
            'paymentMethod': _value(row, headers, const {
              'paymentmethod',
              '付款方式',
              '支付方式',
              '付款账户',
            }),
            'accountName': _value(row, headers, const {
              'accountname',
              '账户',
              '账户名称',
              '资金账户',
            }),
            'status': _value(row, headers, const {
              'status',
              '状态',
              '交易状态',
              '当前状态',
            }),
            'externalId': _value(row, headers, const {
              'externalid',
              'external_id',
              '交易单号',
              '订单号',
              '交易订单号',
            }),
            'currency': _value(row, headers, const {
              'currency',
              '币种',
            }),
          };
          return _normalizeRecord(
            record,
            fallbackNow: fallbackNow,
            useFallbackDate: false,
          );
        })
        .toList();
  }

  static Map<String, dynamic> _normalizeRecord(
    Map<String, dynamic> raw, {
    required DateTime fallbackNow,
    required bool useFallbackDate,
    bool fromWebExport = false,
  }) {
    final hasAmountCents = raw.containsKey('amountCents') ||
        raw.containsKey('amount_cents');
    final rawAmount = hasAmountCents
        ? raw['amountCents'] ?? raw['amount_cents']
        : raw['amount'];
    var amount = _parseMoney(rawAmount);
    if ((fromWebExport || hasAmountCents) && amount != null) {
      amount /= 100;
    }
    final type = _normalizeType(raw['type'] ?? raw['flow'] ?? raw['direction']);
    final occurredAt = _normalizeDate(
      raw['occurredAt'] ??
          raw['occurred_at'] ??
          raw['date'] ??
          raw['time'] ??
          raw['时间'],
      fallback: fallbackNow,
      useFallback: useFallbackDate,
    );
    final source = '${raw['source'] ?? raw['sourceName'] ?? 'generic'}'.trim();
    final sourceName =
        '${raw['sourceName'] ?? raw['source'] ?? '通用账单'}'.trim();
    final accountName = '${raw['accountName'] ?? ''}'.trim();
    final paymentMethod =
        '${raw['paymentMethod'] ?? accountName}'.trim();
    return <String, dynamic>{
      'occurredAt': occurredAt,
      'merchant': '${raw['merchant'] ?? raw['title'] ?? ''}'.trim(),
      'amount': amount?.abs(),
      'type': type,
      'source': source.isEmpty ? 'generic' : source,
      'sourceName': sourceName.isEmpty ? '通用账单' : sourceName,
      'sourceCategory':
          '${raw['sourceCategory'] ?? raw['category'] ?? ''}'.trim(),
      'category': '${raw['category'] ?? ''}'.trim(),
      'incomeCategory': '${raw['incomeCategory'] ?? ''}'.trim(),
      'paymentMethod': paymentMethod,
      'status': '${raw['status'] ?? ''}'.trim(),
      'externalId':
          '${raw['externalId'] ?? raw['crdtId'] ?? raw['syncId'] ?? raw['id'] ?? ''}'
              .trim(),
      'currency': '${raw['currency'] ?? 'CNY'}'.trim(),
      if (raw['accountId'] != null) 'accountId': raw['accountId'],
      if (raw['accountName'] != null) 'accountName': raw['accountName'],
    };
  }

  static String _normalizeType(dynamic value) {
    final text = '$value'.trim().toLowerCase();
    if (text.contains('收入') ||
        text.contains('入账') ||
        text.contains('income') ||
        text.contains('credit') ||
        text == 'in' ||
        text == '+') {
      return '收入';
    }
    if (text.contains('支出') ||
        text.contains('消费') ||
        text.contains('付款') ||
        text.contains('借记') ||
        text.contains('expense') ||
        text.contains('debit') ||
        text == 'out' ||
        text == '-') {
      return '支出';
    }
    return '支出';
  }

  static double? _parseMoney(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    var text = '$value'.trim();
    if (text.isEmpty) return null;
    var negative = false;
    if (text.startsWith('(') && text.endsWith(')')) {
      negative = true;
      text = text.substring(1, text.length - 1);
    }
    text = text
        .replaceAll(RegExp(r'[\s,]'), '')
        .replaceAll(RegExp(r'[¥￥$€£]'), '')
        .replaceFirst(RegExp(r'(元|人民币|CNY|RMB)$', caseSensitive: false), '')
        .trim();
    final parsed = double.tryParse(text);
    if (parsed == null) return null;
    return negative ? -parsed.abs() : parsed;
  }

  static String _normalizeDate(
    dynamic value, {
    required DateTime fallback,
    required bool useFallback,
  }) {
    final text = '$value'.trim();
    if (value == null || text.isEmpty || text == 'null') {
      return useFallback ? _formatDateTime(fallback) : '';
    }
    final compact = RegExp(r'^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2})(\d{2})(\d{2})?)?$')
        .firstMatch(text);
    if (compact != null) {
      return _dateParts(
        compact.group(1)!,
        compact.group(2)!,
        compact.group(3)!,
        compact.group(4) ?? '00',
        compact.group(5) ?? '00',
        compact.group(6) ?? '00',
      );
    }
    final separated = RegExp(
      r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?',
    ).firstMatch(text);
    if (separated != null) {
      return _dateParts(
        separated.group(1)!,
        separated.group(2)!,
        separated.group(3)!,
        separated.group(4) ?? '00',
        separated.group(5) ?? '00',
        separated.group(6) ?? '00',
      );
    }
    final parsed = DateTime.tryParse(text);
    return parsed == null ? text : _formatDateTime(parsed);
  }

  static String _dateParts(
    String year,
    String month,
    String day,
    String hour,
    String minute,
    String second,
  ) {
    String pad(String value) => value.padLeft(2, '0');
    return '$year-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}';
  }

  static String _formatDateTime(DateTime value) => _dateParts(
        '${value.year}',
        '${value.month}',
        '${value.day}',
        '${value.hour}',
        '${value.minute}',
        '${value.second}',
      );

  static String _normalizeHeader(String value) => value
      .replaceFirst('\uFEFF', '')
      .replaceAll(RegExp(r'\s+'), '')
      .toLowerCase();

  static String _value(
    List<String> row,
    List<String> headers,
    Set<String> aliases,
  ) {
    for (var index = 0; index < headers.length; index++) {
      if (aliases.contains(headers[index])) {
        return index < row.length ? row[index].trim() : '';
      }
    }
    return '';
  }

  static String _inferSource(String text) {
    if (text.contains('微信')) return 'wechat';
    if (text.contains('支付宝')) return 'alipay';
    if (text.contains('抖音')) return 'douyin';
    if (text.contains('淘宝')) return 'taobao';
    if (text.contains('京东')) return 'jd';
    if (text.contains('美团')) return 'meituan';
    return 'generic';
  }

  static List<List<String>> _parseCsvRows(String text) {
    final rows = <List<String>>[];
    var row = <String>[];
    final cell = StringBuffer();
    var quoted = false;
    for (var index = 0; index < text.length; index++) {
      final character = text[index];
      if (character == '"') {
        if (quoted && index + 1 < text.length && text[index + 1] == '"') {
          cell.write('"');
          index++;
        } else {
          quoted = !quoted;
        }
      } else if (character == ',' && !quoted) {
        row.add(cell.toString());
        cell.clear();
      } else if ((character == '\n' || character == '\r') && !quoted) {
        if (character == '\r' &&
            index + 1 < text.length &&
            text[index + 1] == '\n') {
          index++;
        }
        row.add(cell.toString());
        cell.clear();
        rows.add(row);
        row = <String>[];
      } else {
        cell.write(character);
      }
    }
    row.add(cell.toString());
    if (row.any((value) => value.isNotEmpty) || rows.isEmpty) rows.add(row);
    return rows;
  }
}
