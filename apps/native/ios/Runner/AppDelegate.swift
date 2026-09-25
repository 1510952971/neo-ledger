import Flutter
import UIKit
import Vision
import ImageIO

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

    let screenshotOCR = FlutterMethodChannel(
      name: "online.eyeme.neo_ledger/screenshot_ocr",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    screenshotOCR.setMethodCallHandler { call, result in
      guard call.method == "recognizeImage" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard
        let arguments = call.arguments as? [String: Any],
        let typedData = arguments["bytes"] as? FlutterStandardTypedData,
        !typedData.data.isEmpty
      else {
        result(FlutterError(code: "INVALID_IMAGE", message: "图片内容为空", details: nil))
        return
      }

      let imageData = typedData.data
      DispatchQueue.global(qos: .userInitiated).async {
        guard let source = CGImageSourceCreateWithData(imageData as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceCreateThumbnailWithTransform: true,
                  kCGImageSourceThumbnailMaxPixelSize: 2560,
                ] as CFDictionary
              )
        else {
          DispatchQueue.main.async {
            result(FlutterError(code: "INVALID_IMAGE", message: "无法读取所选图片", details: nil))
          }
          return
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = true
        do {
          try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
          let text = (request.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
          DispatchQueue.main.async { result(text) }
        } catch {
          DispatchQueue.main.async {
            result(FlutterError(code: "OCR_FAILED", message: error.localizedDescription, details: nil))
          }
        }
      }
    }
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
