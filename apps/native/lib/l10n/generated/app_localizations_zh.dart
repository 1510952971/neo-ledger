// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => 'Neo Ledger';

  @override
  String get home => '首页';

  @override
  String get bills => '账单';

  @override
  String get analytics => '分析';

  @override
  String get profile => '我的';

  @override
  String get quickEntry => '记一笔';

  @override
  String get closeEntry => '关闭记账';

  @override
  String get entryTitle => '记一笔';

  @override
  String get expense => '支出';

  @override
  String get income => '收入';

  @override
  String get transfer => '转账';

  @override
  String get saveEntry => '保存';
}
