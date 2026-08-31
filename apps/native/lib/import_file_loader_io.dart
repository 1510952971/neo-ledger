import 'dart:convert';
import 'dart:io';

Future<String> loadImportFile(String path) async {
  final bytes = await File(path).readAsBytes();
  if (bytes.isEmpty) throw const FormatException('所选文件为空');
  return utf8.decode(bytes, allowMalformed: false);
}
