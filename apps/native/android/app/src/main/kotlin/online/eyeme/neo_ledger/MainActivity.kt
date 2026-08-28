package online.eyeme.neo_ledger

import android.content.Intent
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import online.eyeme.neoledger.companion.NeoCompanionBridge

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL = "online.eyeme.neo_ledger/companion"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "configure" -> {
                        try {
                            val endpoint = call.argument<String>("endpoint")
                                ?: throw IllegalArgumentException("缺少服务地址")
                            val secret = call.argument<String>("secret")
                                ?: throw IllegalArgumentException("缺少自动记账密钥")
                            val ledgerId = call.argument<Int>("ledgerId")
                                ?: throw IllegalArgumentException("缺少账本")
                            NeoCompanionBridge.configure(
                                this,
                                endpoint,
                                secret,
                                ledgerId,
                                call.argument<Boolean>("wechat") ?: true,
                                call.argument<Boolean>("alipay") ?: true,
                                call.argument<Boolean>("marketApps") ?: true,
                                call.argument<String>("extraPackages") ?: "",
                            )
                            result.success(null)
                        } catch (error: Exception) {
                            result.error(
                                "CONFIGURE_FAILED",
                                error.message ?: "Android 自动记账配置失败",
                                null,
                            )
                        }
                    }

                    "status" -> result.success(NeoCompanionBridge.status(this))

                    "openNotificationSettings" -> {
                        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        result.success(null)
                    }

                    "openAccessibilitySettings" -> {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        result.success(null)
                    }

                    "installUpdate" -> {
                        val version = call.argument<String>("version") ?: ""
                        val apkUrl = call.argument<String>("apkUrl")
                        val checksumUrl = call.argument<String>("checksumUrl") ?: ""
                        val apkName = call.argument<String>("apkName") ?: ""
                        if (apkUrl.isNullOrBlank()) {
                            result.error("UPDATE_FAILED", "缺少 APK 下载地址", null)
                        } else {
                            NeoCompanionBridge.installUpdate(
                                this,
                                version,
                                apkUrl,
                                checksumUrl,
                                apkName,
                            ) { update -> result.success(update) }
                        }
                    }

                    else -> result.notImplemented()
                }
            }
    }
}
