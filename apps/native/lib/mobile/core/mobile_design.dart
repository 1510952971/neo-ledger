import 'package:flutter/material.dart';

/// Shared visual tokens for the native phone and tablet experience.
///
/// Keeping these values outside feature widgets prevents the mobile UI from
/// drifting as more native screens replace their web counterparts.
abstract final class MobileColors {
  static MobilePalette _palette = MobilePalette.obsidian;

  static Color get background => _palette.background;
  static Color get surface => _palette.surface;
  static Color get surfaceRaised => _palette.surfaceRaised;
  static Color get line => _palette.line;
  static Color get brand => _palette.brand;
  static Color get purple => _palette.purple;
  static Color get muted => _palette.muted;
  static Color get income => _palette.income;
  static Color get expense => _palette.expense;
  static Brightness get brightness => _palette.brightness;
  static Color get foreground => _palette.brightness == Brightness.dark
      ? const Color(0xfff5f6f7)
      : const Color(0xff171a1d);
  static Color get onBrand => _palette.brightness == Brightness.dark
      ? _palette.background
      : const Color(0xffffffff);

  static void configure({
    required String theme,
    required String mode,
    required Brightness systemBrightness,
    required bool highContrast,
  }) {
    final dark = mode == 'system'
        ? systemBrightness == Brightness.dark
        : mode == 'dark';
    _palette = MobilePalette.forSettings(
      theme: theme,
      dark: dark,
      highContrast: highContrast,
    );
  }
}

class MobilePalette {
  const MobilePalette({
    required this.background,
    required this.surface,
    required this.surfaceRaised,
    required this.line,
    required this.brand,
    required this.purple,
    required this.muted,
    required this.income,
    required this.expense,
    required this.brightness,
  });

  static const obsidian = MobilePalette(
    background: Color(0xff0e1015),
    surface: Color(0xff171a22),
    surfaceRaised: Color(0xff20242e),
    line: Color(0x1fffffff),
    brand: Color(0xffa5ff4f),
    purple: Color(0xffaa8cff),
    muted: Color(0xff9ca3ad),
    income: Color(0xff65d89b),
    expense: Color(0xffff8a7a),
    brightness: Brightness.dark,
  );

  static MobilePalette forSettings({
    required String theme,
    required bool dark,
    required bool highContrast,
  }) {
    if (dark) {
      if (!highContrast) return obsidian;
      return const MobilePalette(
        background: Color(0xff000000),
        surface: Color(0xff090b0e),
        surfaceRaised: Color(0xff171a20),
        line: Color(0x99ffffff),
        brand: Color(0xffbaff6b),
        purple: Color(0xffc4afff),
        muted: Color(0xffe0e3e8),
        income: Color(0xff80f2b1),
        expense: Color(0xffffa193),
        brightness: Brightness.dark,
      );
    }

    final glacier = theme == 'glacier';
    final peach = theme == 'peach';
    final palette = MobilePalette(
      background: glacier
          ? const Color(0xffedf3f6)
          : peach
          ? const Color(0xfffff2ed)
          : const Color(0xfff1f2ef),
      surface: glacier || peach
          ? const Color(0xfffdfefe)
          : const Color(0xffffffff),
      surfaceRaised: glacier
          ? const Color(0xffe4edf2)
          : peach
          ? const Color(0xfffae7de)
          : const Color(0xffe8eae5),
      line: const Color(0x260e1820),
      brand: glacier ? const Color(0xff287db9) : const Color(0xff568d26),
      purple: glacier
          ? const Color(0xff6355ac)
          : peach
          ? const Color(0xff965a9d)
          : const Color(0xff7256a6),
      muted: highContrast ? const Color(0xff3e454b) : const Color(0xff667078),
      income: const Color(0xff24754e),
      expense: const Color(0xffb94f43),
      brightness: Brightness.light,
    );
    if (!highContrast) return palette;
    return MobilePalette(
      background: palette.background,
      surface: palette.surface,
      surfaceRaised: palette.surfaceRaised,
      line: const Color(0xff4a535b),
      brand: glacier ? const Color(0xff155b91) : const Color(0xff326500),
      purple: palette.purple,
      muted: const Color(0xff30383f),
      income: const Color(0xff135d3a),
      expense: const Color(0xff9b3027),
      brightness: Brightness.light,
    );
  }

  final Color background;
  final Color surface;
  final Color surfaceRaised;
  final Color line;
  final Color brand;
  final Color purple;
  final Color muted;
  final Color income;
  final Color expense;
  final Brightness brightness;
}

abstract final class MobileSpacing {
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const page = 18.0;
}

abstract final class MobileRadii {
  static const small = 12.0;
  static const medium = 16.0;
  static const large = 22.0;
  static const pill = 999.0;
}

abstract final class MobileMotion {
  static const fast = Duration(milliseconds: 140);
  static const standard = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 360);
}
