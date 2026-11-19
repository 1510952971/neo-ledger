/// Public endpoints used by the distributed Neo Ledger clients.
///
/// The compile-time override lets a release build target a new domain without
/// changing request code. Existing clients still migrate from the previous
/// AWS-hosted origin when they load their saved server preference.
class NeoLedgerEndpoints {
  static const defaultBaseUrl = String.fromEnvironment(
    'NEO_LEDGER_DEFAULT_BASE_URL',
    defaultValue: 'https://ledger.985251.xyz',
  );

  static const legacyBaseUrl = 'https://ledger.eyeme.online';

  static String nativeUpdateUrl({required int cacheBust}) =>
      '$defaultBaseUrl/api/native-update?ts=$cacheBust';
}
