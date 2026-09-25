import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/core/mobile_design.dart';

void main() {
  test('native palette follows selected mode and supports high contrast', () {
    MobileColors.configure(
      theme: 'glacier',
      mode: 'system',
      systemBrightness: Brightness.light,
      highContrast: false,
    );
    expect(MobileColors.brightness, Brightness.light);
    expect(MobileColors.foreground, const Color(0xff171a1d));
    expect(MobileColors.onBrand, const Color(0xffffffff));
    final lightSurface = MobileColors.surface;

    MobileColors.configure(
      theme: 'glacier',
      mode: 'dark',
      systemBrightness: Brightness.light,
      highContrast: false,
    );
    expect(MobileColors.brightness, Brightness.dark);
    expect(MobileColors.background, isNot(lightSurface));
    expect(MobileColors.foreground, const Color(0xfff5f6f7));

    MobileColors.configure(
      theme: 'peach',
      mode: 'light',
      systemBrightness: Brightness.dark,
      highContrast: true,
    );
    expect(MobileColors.brightness, Brightness.light);
    final contrastLine = MobileColors.line;
    MobileColors.configure(
      theme: 'peach',
      mode: 'light',
      systemBrightness: Brightness.dark,
      highContrast: false,
    );
    expect(contrastLine, isNot(MobileColors.line));
  });
}
