import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Reads a SHA-256 manifest produced by tools such as `sha256sum`.
///
/// Both of the common formats are accepted:
///
///     <digest>  file.apk
///     <digest> *file.apk
///
/// The filename must match exactly. This prevents an update from being
/// accepted because another asset in the same release happened to have the
/// expected digest.
String? findExpectedSha256(String manifest, String fileName) {
  for (final rawLine in const LineSplitter().convert(manifest)) {
    final line = rawLine.trim();
    if (line.isEmpty || line.startsWith('#')) continue;

    final match = RegExp(
      r'^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$',
    ).firstMatch(line);
    if (match == null) continue;

    final candidateName = match.group(2);
    if (candidateName == fileName) {
      return match.group(1)!.toLowerCase();
    }
  }
  return null;
}

bool verifySha256({required List<int> bytes, required String expected}) {
  final normalized = expected.trim().toLowerCase();
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(normalized)) return false;
  return sha256.convert(bytes).toString() == normalized;
}

