import 'package:flutter/services.dart';

abstract interface class MobileScreenshotOcr {
  Future<String> recognize(List<int> imageBytes);
}

class PlatformMobileScreenshotOcr implements MobileScreenshotOcr {
  PlatformMobileScreenshotOcr({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel(_channelName);

  static const _channelName = 'online.eyeme.neo_ledger/screenshot_ocr';
  final MethodChannel _channel;

  @override
  Future<String> recognize(List<int> imageBytes) async {
    if (imageBytes.isEmpty) throw const FormatException('图片内容为空');
    final text = await _channel.invokeMethod<String>('recognizeImage', {
      'bytes': Uint8List.fromList(imageBytes),
    });
    final result = text?.trim() ?? '';
    if (result.isEmpty) throw const FormatException('未能从截图中识别出文字');
    return result;
  }
}
