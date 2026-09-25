import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:neo_ledger/features/profile/avatar_crop_sheet.dart';

Uint8List _pngFixture() {
  final image = img.Image(width: 64, height: 48);
  img.fill(image, color: img.ColorRgb8(48, 128, 192));
  return Uint8List.fromList(img.encodePng(image));
}

void main() {
  test('encodes an oriented square JPEG within the upload limit', () {
    final encoded = encodeAvatarCropForUpload(
      sourceBytes: _pngFixture(),
      scale: 1,
      translationX: 0,
      translationY: 0,
    );

    expect(encoded.length, lessThanOrEqualTo(maxAvatarUploadBytes));
    expect(encoded.take(3), [0xff, 0xd8, 0xff]);
    final decoded = img.decodeImage(encoded);
    expect(decoded?.width, 512);
    expect(decoded?.height, 512);
  });

  test('rejects invalid image bytes before an upload can be made', () {
    expect(
      () => encodeAvatarCropForUpload(
        sourceBytes: Uint8List.fromList([1, 2, 3]),
        scale: 1,
        translationX: 0,
        translationY: 0,
      ),
      throwsA(isA<FormatException>()),
    );
  });

  testWidgets('crop sheet returns the encoded bytes from its cropper', (
    tester,
  ) async {
    Uint8List? result;
    var cropperCalled = false;
    final source = _pngFixture();
    final encoded = Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                result = await showAvatarCropSheet(
                  context,
                  source,
                  cropEncoder: (bytes, scale, x, y) async {
                    cropperCalled = true;
                    expect(bytes, same(source));
                    expect(scale, 1);
                    expect(x, 0);
                    expect(y, 0);
                    return encoded;
                  },
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('调整头像'), findsOneWidget);

    await tester.tap(find.text('使用此头像'));
    await tester.pumpAndSettle();

    expect(cropperCalled, isTrue);
    expect(result, same(encoded));
  });
}
