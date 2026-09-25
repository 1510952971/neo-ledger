const mobileNavigationRailBreakpoint = 840.0;
const mobileTabletContentMaxWidth = 1180.0;

bool mobileUsesNavigationRail(double width) =>
    width >= mobileNavigationRailBreakpoint;

double mobileContentMaxWidth(double width) =>
    mobileUsesNavigationRail(width) ? mobileTabletContentMaxWidth : width;
