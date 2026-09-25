import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

const maxAvatarUploadBytes = 512 * 1024;
const _cropViewportSize = 256.0;

typedef AvatarCropEncoder = Future<Uint8List> Function(
  Uint8List sourceBytes,
  double scale,
  double translationX,
  double translationY,
);

Uint8List encodeAvatarCropForUpload({
  required Uint8List sourceBytes,
  required double scale,
  required double translationX,
  required double translationY,
}) {
  img.Image? source;
  try {
    source = img.decodeImage(sourceBytes);
  } catch (_) {
    throw const FormatException('无法解码所选图片');
  }
  if (source == null) throw const FormatException('无法解码所选图片');
  final image = img.bakeOrientation(source);
  final side = image.width < image.height ? image.width : image.height;
  final clampedScale = scale.clamp(1.0, 4.0);
  final cropSide = (side / clampedScale).round().clamp(1, side);
  final centerX = (image.width - side) / 2;
  final centerY = (image.height - side) / 2;
  final offsetX = (-translationX / clampedScale / _cropViewportSize * side)
      .clamp(0.0, (side - cropSide).toDouble());
  final offsetY = (-translationY / clampedScale / _cropViewportSize * side)
      .clamp(0.0, (side - cropSide).toDouble());
  final cropped = img.copyCrop(
    image,
    x: centerX.round() + offsetX.round(),
    y: centerY.round() + offsetY.round(),
    width: cropSide,
    height: cropSide,
  );

  for (final width in const [512, 384, 256]) {
    for (final quality in const [86, 72, 58]) {
      final resized = img.copyResize(
        cropped,
        width: width,
        height: width,
        interpolation: img.Interpolation.average,
      );
      final encoded = img.encodeJpg(resized, quality: quality);
      if (encoded.length <= maxAvatarUploadBytes) return encoded;
    }
  }
  throw const FormatException('压缩后的头像仍超过 512 KB，请换一张图片');
}

Uint8List _encodeAvatarCropInIsolate(Map<String, Object?> request) =>
    encodeAvatarCropForUpload(
      sourceBytes: request['source']! as Uint8List,
      scale: request['scale']! as double,
      translationX: request['translationX']! as double,
      translationY: request['translationY']! as double,
    );

Future<Uint8List?> showAvatarCropSheet(
  BuildContext context,
  Uint8List sourceBytes, {
  AvatarCropEncoder? cropEncoder,
}) => showModalBottomSheet<Uint8List>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) =>
      _AvatarCropSheet(sourceBytes: sourceBytes, cropEncoder: cropEncoder),
);

class _AvatarCropSheet extends StatefulWidget {
  const _AvatarCropSheet({required this.sourceBytes, this.cropEncoder});

  final Uint8List sourceBytes;
  final AvatarCropEncoder? cropEncoder;

  @override
  State<_AvatarCropSheet> createState() => _AvatarCropSheetState();
}

class _AvatarCropSheetState extends State<_AvatarCropSheet> {
  final _transform = TransformationController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final matrix = _transform.value;
      final scale = matrix.getMaxScaleOnAxis();
      final translationX = matrix.entry(0, 3);
      final translationY = matrix.entry(1, 3);
      final compressed = widget.cropEncoder != null
          ? await widget.cropEncoder!(
              widget.sourceBytes,
              scale,
              translationX,
              translationY,
            )
          : await compute(_encodeAvatarCropInIsolate, {
              'source': widget.sourceBytes,
              'scale': scale,
              'translationX': translationX,
              'translationY': translationY,
            });
      if (mounted) Navigator.pop(context, compressed);
    } catch (error) {
      if (mounted) setState(() => _error = '裁剪图片失败：$error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('调整头像', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            const Text('拖动图片调整位置，双指缩放；头像会裁为正方形并压缩后上传。'),
            const SizedBox(height: 16),
            Center(
              child: SizedBox.square(
                dimension: _cropViewportSize,
                child: ClipRect(
                  child: ColoredBox(
                    color: Theme.of(context).colorScheme.surface,
                    child: InteractiveViewer(
                      transformationController: _transform,
                      constrained: false,
                      minScale: 1,
                      maxScale: 4,
                      boundaryMargin: const EdgeInsets.all(160),
                      clipBehavior: Clip.hardEdge,
                      child: SizedBox.square(
                        dimension: _cropViewportSize,
                        child: Image.memory(
                          widget.sourceBytes,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Center(
                            child: Text('无法解码该图片，请尝试 JPG 或 PNG'),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.crop_rounded),
              label: Text(_saving ? '正在裁剪…' : '使用此头像'),
            ),
          ],
        ),
      ),
    );
  }
}
