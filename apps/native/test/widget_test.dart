import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/models.dart';

void main() {
  test('transaction amounts convert cents to major units', () {
    final item = TransactionItem.fromJson({
      'id': 7,
      'title': '午餐',
      'amount': 1288,
      'type': '支出',
      'occurredAt': '2026-08-25T12:00:00Z',
    });
    expect(item.amount, 12.88);
    expect(item.isIncome, isFalse);
  });

  test('native GitHub release metadata identifies an update', () {
    final update = UpdateInfo.fromGitHub({
      'tag_name': 'native-v1.3.0',
      'html_url':
          'https://github.com/1510952971/neo-ledger/releases/tag/native-v1.3.0',
      'body': '同步优化',
      'assets': [
        {
          'name': 'neo-ledger-android-1.3.0.apk',
          'browser_download_url': 'https://example.com/app.apk',
        },
      ],
    });

    expect(update.isNewerThan('1.2.0'), isTrue);
    expect(update.assetFor('android'), endsWith('.apk'));
  });

  test('native updater prefers installable APK over Android AAB', () {
    final update = UpdateInfo.fromGitHub({
      'tag_name': 'native-v1.3.0',
      'html_url':
          'https://github.com/1510952971/neo-ledger/releases/tag/native-v1.3.0',
      'assets': [
        {
          'name': 'neo-ledger-android-1.3.0.aab',
          'browser_download_url': 'https://example.com/app.aab',
        },
        {
          'name': 'neo-ledger-android-1.3.0.apk',
          'browser_download_url': 'https://example.com/app.apk',
        },
      ],
    });

    expect(update.assetNameFor('android'), 'neo-ledger-android-1.3.0.apk');
    expect(update.assetFor('android'), 'https://example.com/app.apk');
  });

  test('native updater prefers Windows installer over portable ZIP', () {
    final update = UpdateInfo.fromGitHub({
      'tag_name': 'native-v1.3.0',
      'html_url':
          'https://github.com/1510952971/neo-ledger/releases/tag/native-v1.3.0',
      'assets': [
        {
          'name': 'neo-ledger-windows-1.3.0.zip',
          'browser_download_url': 'https://example.com/neo-ledger.zip',
        },
        {
          'name': 'neo-ledger-windows-1.3.0-setup.exe',
          'browser_download_url': 'https://example.com/neo-ledger-setup.exe',
        },
      ],
    });

    expect(
      update.assetNameFor('windows'),
      'neo-ledger-windows-1.3.0-setup.exe',
    );
    expect(
      update.assetFor('windows'),
      'https://example.com/neo-ledger-setup.exe',
    );
  });

  test('native updater prefers macOS DMG over portable ZIP', () {
    final update = UpdateInfo.fromGitHub({
      'tag_name': 'native-v1.3.0',
      'html_url':
          'https://github.com/1510952971/neo-ledger/releases/tag/native-v1.3.0',
      'assets': [
        {
          'name': 'neo-ledger-macos-1.3.0.zip',
          'browser_download_url': 'https://example.com/macos.zip',
        },
        {
          'name': 'neo-ledger-macos-1.3.0.dmg',
          'browser_download_url': 'https://example.com/macos.dmg',
        },
      ],
    });

    expect(update.assetNameFor('macos'), 'neo-ledger-macos-1.3.0.dmg');
  });
}
