import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/amount_expression.dart';

void main() {
  group('AmountExpression', () {
    test('evaluates addition and subtraction in cents', () {
      expect(AmountExpression.evaluateCents('12.50+3-0.25'), 1525);
      expect(AmountExpression.evaluateCents('0.01+0.02'), 3);
    });

    test('rejects invalid, non-positive and excessive values', () {
      expect(AmountExpression.evaluateCents(''), isNull);
      expect(AmountExpression.evaluateCents('1+'), isNull);
      expect(AmountExpression.evaluateCents('1.234'), isNull);
      expect(AmountExpression.evaluateCents('2-2'), isNull);
      expect(AmountExpression.evaluateCents('1000000000'), isNull);
    });

    test('limits decimal input and adjacent operators', () {
      expect(AmountExpression.canAppend('1.2', '3'), isTrue);
      expect(AmountExpression.canAppend('1.23', '4'), isFalse);
      expect(AmountExpression.canAppend('1+', '-'), isFalse);
      expect(AmountExpression.canAppend('1', '+'), isTrue);
    });
  });
}
