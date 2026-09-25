typedef ImportBatchSender = Future<Map<String, dynamic>> Function(
  List<Map<String, dynamic>> items,
);

typedef ImportBatchProgress = void Function({
  required int completed,
  required int total,
  required int imported,
  required int duplicates,
  required int skipped,
});

class ImportBatchResult {
  const ImportBatchResult({
    required this.completed,
    required this.total,
    required this.imported,
    required this.duplicates,
    required this.skipped,
    required this.cancelled,
  });

  final int completed;
  final int total;
  final int imported;
  final int duplicates;
  final int skipped;
  final bool cancelled;

  Map<String, dynamic> toJson() => {
    'ok': !cancelled,
    'completed': completed,
    'total': total,
    'imported': imported,
    'duplicates': duplicates,
    'skipped': skipped,
    'cancelled': cancelled,
  };
}

/// Imports a reviewed file in bounded, sequential requests.
///
/// The caller retains the source rows and resumes from [completed] after a
/// failure. Each request is independently idempotent at the API transport;
/// the server also deduplicates imported rows by their stable import key.
Future<ImportBatchResult> importInBatches({
  required List<Map<String, dynamic>> items,
  required ImportBatchSender sendBatch,
  required bool Function() shouldCancel,
  required ImportBatchProgress onProgress,
  int batchSize = 200,
}) async {
  if (batchSize < 1 || batchSize > 500) {
    throw ArgumentError.value(
      batchSize,
      'batchSize',
      'must be between 1 and 500',
    );
  }

  var completed = 0;
  var imported = 0;
  var duplicates = 0;
  var skipped = 0;
  while (completed < items.length) {
    if (shouldCancel()) break;
    final end = (completed + batchSize).clamp(0, items.length);
    final result = await sendBatch(items.sublist(completed, end));
    final batchImported = _asInt(result['imported']);
    final batchDuplicates = _asInt(result['duplicates']);
    final batchSkipped = _asInt(result['skipped']);
    imported += batchImported;
    duplicates += batchDuplicates;
    skipped += batchSkipped;
    completed = end;
    onProgress(
      completed: completed,
      total: items.length,
      imported: imported,
      duplicates: duplicates,
      skipped: skipped,
    );
  }

  return ImportBatchResult(
    completed: completed,
    total: items.length,
    imported: imported,
    duplicates: duplicates,
    skipped: skipped,
    cancelled: completed < items.length,
  );
}

int _asInt(Object? value) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? 0;
