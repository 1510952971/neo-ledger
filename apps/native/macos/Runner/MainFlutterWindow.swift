import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()

    // Start as a real desktop workspace instead of Flutter's 800×600 template.
    // On smaller Mac displays, fit within the visible area while retaining the
    // desktop breakpoint and enough height for the dashboard content.
    let visibleFrame = self.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
    let availableWidth = visibleFrame?.width ?? 1440
    let availableHeight = visibleFrame?.height ?? 900
    let contentWidth = min(1440, max(1100, availableWidth * 0.92))
    let contentHeight = min(900, max(720, availableHeight * 0.90))
    self.minSize = NSSize(
      width: min(1000, availableWidth),
      height: min(680, availableHeight)
    )
    self.setContentSize(NSSize(width: contentWidth, height: contentHeight))
    self.center()
  }
}
