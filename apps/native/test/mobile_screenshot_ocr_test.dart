import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_screenshot_ocr.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('online.eyeme.neo_ledger/screenshot_ocr');

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('sends image bytes to native OCR and returns local text', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          expect(call.method, 'recognizeImage');
          expect(call.arguments, contains('bytes'));
          return '支付成功\n金额：¥18.80';
        });

    final text = await PlatformMobileScreenshotOcr().recognize([1, 2, 3]);

    expect(text, '支付成功\n金额：¥18.80');
  });

  test(
    'rejects an empty image without invoking the platform channel',
    () async {
      await expectLater(
        PlatformMobileScreenshotOcr().recognize(const []),
        throwsA(isA<FormatException>()),
      );
    },
  );

  test('rejects an empty native OCR result', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => '  ');

    await expectLater(
      PlatformMobileScreenshotOcr().recognize([1]),
      throwsA(isA<FormatException>()),
    );
  });
}
