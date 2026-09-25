/// Shared cadence for the native clients' opportunistic cross-device refresh.
///
/// Cheap revision probes can happen often; the periodic full refresh is kept as
/// a compatibility and global-state safety net, and is not postponed by
/// ordinary ledger changes.
class MobileBackgroundRefreshPolicy {
  MobileBackgroundRefreshPolicy({DateTime? lastFullRefreshAt})
    : _lastFullRefreshAt = lastFullRefreshAt ?? DateTime.now();

  static const probeInterval = Duration(seconds: 30);
  static const fullRefreshInterval = Duration(minutes: 5);

  DateTime _lastFullRefreshAt;

  bool isFullRefreshDue([DateTime? now]) =>
      (now ?? DateTime.now()).difference(_lastFullRefreshAt) >=
      fullRefreshInterval;

  void recordFullRefresh([DateTime? now]) {
    _lastFullRefreshAt = now ?? DateTime.now();
  }
}
