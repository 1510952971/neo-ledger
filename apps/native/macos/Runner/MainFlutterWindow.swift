import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()

    // Match the native window to the web cockpit's 1260px design frame instead
    // of expanding it to nearly the whole display. Smaller screens still fit
    // inside the visible work area while retaining the desktop breakpoint.
    let visibleFrame = self.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
    let availableWidth = visibleFrame?.width ?? 1440
    let availableHeight = visibleFrame?.height ?? 900
    let contentWidth = min(1260, max(1100, availableWidth - 40))
    let contentHeight = min(820, max(720, availableHeight - 40))
    self.minSize = NSSize(
      width: min(1000, availableWidth),
      height: min(680, availableHeight)
    )
    self.setContentSize(NSSize(width: contentWidth, height: contentHeight))
    self.center()
  }
}
