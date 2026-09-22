import 'package:flutter/material.dart';

/// Shared visual tokens for the native phone and tablet experience.
///
/// Keeping these values outside feature widgets prevents the mobile UI from
/// drifting as more native screens replace their web counterparts.
abstract final class MobileColors {
  static const background = Color(0xff0e1015);
  static const surface = Color(0xff171a22);
  static const surfaceRaised = Color(0xff20242e);
  static const line = Color(0x1fffffff);
  static const brand = Color(0xffa5ff4f);
  static const purple = Color(0xffaa8cff);
  static const muted = Color(0xff9ca3ad);
  static const income = Color(0xff65d89b);
  static const expense = Color(0xffff8a7a);
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
