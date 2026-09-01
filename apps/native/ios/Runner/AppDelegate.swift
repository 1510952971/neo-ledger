import Flutter
import UIKit

final class ShortcutBridge {
  static let shared = ShortcutBridge()

  private let channelName = "online.eyeme.neo_ledger/shortcuts"
  private var channel: FlutterMethodChannel?
  private var pendingURLs: [String] = []

  private init() {}

  func install(using engineBridge: FlutterImplicitEngineBridge) {
    let methodChannel = FlutterMethodChannel(
      name: channelName,
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel = methodChannel
    methodChannel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(nil)
        return
      }
      switch call.method {
      case "getPendingShortcutUrls":
        let values = self.pendingURLs
        self.pendingURLs.removeAll()
        result(values)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  @discardableResult
  func handle(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "neoledger",
          url.host?.lowercased() == "entry"
    else {
      return false
    }

    let value = url.absoluteString
    pendingURLs.append(value)
    channel?.invokeMethod("openShortcutUrl", arguments: value) { [weak self] response in
      guard !(response is FlutterError) else { return }
      self?.removePending(value)
    }
    return true
  }

  private func removePending(_ value: String) {
    guard let index = pendingURLs.firstIndex(of: value) else { return }
    pendingURLs.remove(at: index)
  }
}

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if let url = launchOptions?[.url] as? URL {
      ShortcutBridge.shared.handle(url)
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    ShortcutBridge.shared.install(using: engineBridge)
  }

  override func application(
    _ application: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    ShortcutBridge.shared.handle(url)
  }

  override func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    for context in options.urlContexts {
      ShortcutBridge.shared.handle(context.url)
    }
    return UISceneConfiguration(
      name: "flutter",
      sessionRole: connectingSceneSession.role
    )
  }
}
