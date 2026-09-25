import 'dart:convert';

import 'package:http/http.dart' as http;

import '../domain/mobile_api_exception.dart';
import '../domain/mobile_diagnostics.dart';
import 'mobile_idempotency_key_store.dart';
import 'mobile_api_session_store.dart';

typedef MobileApiRequest = Future<http.Response> Function(
  String method,
  Uri uri,
  Map<String, String> headers,
  String? body,
);

/// Owns the HTTP boundary while leaving credentials in the session store.
class MobileApiTransport {
  MobileApiTransport({
    required this.session,
    MobileApiRequest? request,
    this.idempotencyKeys,
  }) : _request = request ?? _httpRequest;

  final MobileApiSessionStore session;
  final MobileApiRequest _request;
  final MobileIdempotencyKeyStore? idempotencyKeys;

  Future<http.Response> send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool includeCookie = true,
    Map<String, String>? extraHeaders,
  }) async {
    final baseUrl = session.baseUrl.replaceFirst(RegExp(r'/+$'), '');
    final apiPath = path.replaceFirst(RegExp(r'^/+'), '');
    final uri = Uri.parse('$baseUrl/$apiPath');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
    };
    if (extraHeaders != null) headers.addAll(extraHeaders);
    if (body != null) headers['Content-Type'] = 'application/json';
    if (includeCookie && session.hasSession) {
      headers['Cookie'] = session.cookie!;
    }
    final encodedBody = body == null ? null : jsonEncode(body);
    final normalizedMethod = method.toUpperCase();
    final keyStore = idempotencyKeys;
    if (keyStore != null && _needsIdempotency(normalizedMethod, apiPath)) {
      try {
        return await keyStore.run(
          operation: 'native-http-${normalizedMethod.toLowerCase()}',
          request: {
            'method': normalizedMethod,
            'uri': uri.toString(),
            'body': encodedBody,
          },
          send: (key) => _sendOnce(normalizedMethod, uri, {
            ...headers,
            if (!headers.keys.any(
              (name) => name.toLowerCase() == 'idempotency-key',
            ))
              'Idempotency-Key': key,
          }, encodedBody),
        );
      } on ApiException catch (error) {
        MobileDiagnostics.instance.recordApiFailure(
          method: normalizedMethod,
          path: apiPath,
          statusCode: error.statusCode,
        );
        rethrow;
      }
    }
    try {
      return await _sendOnce(normalizedMethod, uri, headers, encodedBody);
    } on ApiException catch (error) {
      MobileDiagnostics.instance.recordApiFailure(
        method: normalizedMethod,
        path: apiPath,
        statusCode: error.statusCode,
      );
      rethrow;
    }
  }

  bool _needsIdempotency(String method, String path) {
    if (const {'GET', 'HEAD', 'OPTIONS'}.contains(method) ||
        !path.startsWith('api/')) {
      return false;
    }
    return !(path == 'api/auth' && method != 'PATCH') &&
        !path.startsWith('api/auth/') &&
        path != 'api/data/restore' &&
        path != 'api/security/webauthn' &&
        !path.startsWith('api/security/webauthn/') &&
        !(path == 'api/preferences' && method == 'POST');
  }

  Future<http.Response> _sendOnce(
    String method,
    Uri uri,
    Map<String, String> headers,
    String? body,
  ) async {
    try {
      final response = await _request(method, uri, headers, body);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(_errorMessage(response), response.statusCode);
      }
      return response;
    } on ApiException {
      rethrow;
    } catch (error) {
      throw ApiException('无法连接 ${session.baseUrl}：$error');
    }
  }

  dynamic decodeAny(http.Response response) {
    try {
      return jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      throw const ApiException('服务器返回了无法解析的数据');
    }
  }

  Map<String, dynamic> decodeObject(http.Response response) {
    final value = decodeAny(response);
    if (value is! Map<String, dynamic>) {
      throw const ApiException('服务器响应格式无效');
    }
    return value;
  }

  static Future<http.Response> _httpRequest(
    String method,
    Uri uri,
    Map<String, String> headers,
    String? body,
  ) => switch (method) {
    'POST' => http.post(uri, headers: headers, body: body),
    'PUT' => http.put(uri, headers: headers, body: body),
    'PATCH' => http.patch(uri, headers: headers, body: body),
    'DELETE' => http.delete(uri, headers: headers, body: body),
    _ => http.get(uri, headers: headers),
  };

  String _errorMessage(http.Response response) {
    try {
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is Map<String, dynamic>) {
        return '${decoded['error'] ?? decoded['message'] ?? '请求失败'}';
      }
    } catch (_) {}
    return '请求失败（HTTP ${response.statusCode}）';
  }
}
