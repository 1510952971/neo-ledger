import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      ShortcutBridge.shared.handle(context.url)
    }
  }

}
