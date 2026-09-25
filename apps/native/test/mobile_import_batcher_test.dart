import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/mobile_import_batcher.dart';

void main() {
  test(
    'sends bounded batches sequentially and aggregates confirmed counts',
    () async {
      final batches = <List<int>>[];
      final progress = <int>[];
      final rows = List.generate(5, (index) => {'id': index});
      final result = await importInBatches(
        items: rows,
        batchSize: 2,
        shouldCancel: () => false,
        sendBatch: (batch) async {
          batches.add(batch.map((row) => row['id']! as int).toList());
          return {'imported': batch.length - 1, 'duplicates': 1, 'skipped': 0};
        },
        onProgress:
            ({
              required completed,
              required total,
              required imported,
              required duplicates,
              required skipped,
            }) {
              expect(total, 5);
              progress.add(completed);
            },
      );

      expect(batches, [
        [0, 1],
        [2, 3],
        [4],
      ]);
      expect(progress, [2, 4, 5]);
      expect(result.completed, 5);
      expect(result.imported, 2);
      expect(result.duplicates, 3);
      expect(result.cancelled, isFalse);
    },
  );

  test('cancels between requests and reports a resumable offset', () async {
    var sends = 0;
    final result = await importInBatches(
      items: List.generate(6, (index) => {'id': index}),
      batchSize: 2,
      shouldCancel: () => sends == 1,
      sendBatch: (batch) async {
        sends++;
        return {'imported': batch.length, 'duplicates': 0, 'skipped': 0};
      },
      onProgress: ({
        required completed,
        required total,
        required imported,
        required duplicates,
        required skipped,
      }) {},
    );

    expect(sends, 1);
    expect(result.completed, 2);
    expect(result.cancelled, isTrue);
  });

  test('a failed request does not advance the confirmed offset', () async {
    var sends = 0;
    final progress = <int>[];
    await expectLater(
      importInBatches(
        items: List.generate(4, (index) => {'id': index}),
        batchSize: 2,
        shouldCancel: () => false,
        sendBatch: (batch) async {
          sends++;
          if (sends == 2) throw StateError('temporary failure');
          return {'imported': batch.length, 'duplicates': 0, 'skipped': 0};
        },
        onProgress: ({
          required completed,
          required total,
          required imported,
          required duplicates,
          required skipped,
        }) => progress.add(completed),
      ),
      throwsStateError,
    );
    expect(progress, [2]);
  });
}
