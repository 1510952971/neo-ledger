#include "flutter_window.h"

#include <algorithm>
#include <cwchar>
#include <cwctype>
#include <filesystem>
#include <iterator>
#include <optional>
#include <string>

#include <shellapi.h>
#include <shlobj.h>

#include "flutter/generated_plugin_registrant.h"
#include "resource.h"

namespace {

constexpr UINT kTrayCallbackMessage = WM_APP + 1;
constexpr UINT kTrayOpenCommand = 1001;
constexpr UINT kTrayExitCommand = 1002;

std::filesystem::path DataDirectory() {
  PWSTR local_app_data = nullptr;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DEFAULT,
                                     nullptr, &local_app_data))) {
    const std::filesystem::path result =
        std::filesystem::path(local_app_data) / L"Neo Ledger";
    CoTaskMemFree(local_app_data);
    std::error_code error;
    std::filesystem::create_directories(result, error);
    return result;
  }

  std::error_code error;
  const auto result = std::filesystem::temp_directory_path(error) /
                      L"neo-ledger-data";
  std::filesystem::create_directories(result, error);
  return result;
}

std::filesystem::path TempDirectory() {
  std::error_code error;
  const auto path = std::filesystem::temp_directory_path(error);
  return error ? std::filesystem::path() : path;
}

bool IsNeoWindowsInstaller(const std::filesystem::path& path) {
  std::wstring name = path.filename().wstring();
  std::transform(name.begin(), name.end(), name.begin(), [](wchar_t value) {
    return std::towlower(value);
  });
  constexpr wchar_t kPrefix[] = L"neo-ledger-windows-";
  constexpr wchar_t kSuffix[] = L".exe";
  return name.rfind(kPrefix, 0) == 0 &&
         name.size() >= std::size(kPrefix) - 1 + std::size(kSuffix) - 1 &&
         name.compare(name.size() - (std::size(kSuffix) - 1),
                      std::size(kSuffix) - 1, kSuffix) == 0;
}

bool IsDirectChildOf(const std::filesystem::path& file,
                     const std::filesystem::path& directory) {
  std::error_code error;
  const auto canonical_file = std::filesystem::weakly_canonical(file, error);
  if (error) return false;
  error.clear();
  const auto canonical_directory =
      std::filesystem::weakly_canonical(directory, error);
  if (error) return false;
  return canonical_file.parent_path() == canonical_directory;
}

}  // namespace

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  ConfigurePlatformChannel();
  ConfigureTrayIcon();
  DragAcceptFiles(GetHandle(), TRUE);
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  flutter_controller_->engine()->SetNextFrameCallback([&]() {
    this->Show();
  });

  // Flutter can complete the first frame before the "show window" callback is
  // registered. The following call ensures a frame is pending to ensure the
  // window is shown. It is a no-op if the first frame hasn't completed yet.
  flutter_controller_->ForceRedraw();

  return true;
}

void FlutterWindow::OnDestroy() {
  RemoveTrayIcon();
  platform_channel_.reset();
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

void FlutterWindow::ConfigurePlatformChannel() {
  platform_channel_ = std::make_unique<
      flutter::MethodChannel<flutter::EncodableValue>>(
      flutter_controller_->engine()->messenger(), "neo_ledger/platform",
      &flutter::StandardMethodCodec::GetInstance());
  platform_channel_->SetMethodCallHandler(
      [this](const flutter::MethodCall<flutter::EncodableValue>& call,
             std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>>
                 result) {
        if (call.method_name() == "getDataDirectory") {
          result->Success(flutter::EncodableValue(
              Utf8FromWide(DataDirectory().wstring())));
          return;
        }

        if (call.method_name() == "openDataDirectory") {
          const auto directory = DataDirectory();
          const auto status = reinterpret_cast<INT_PTR>(ShellExecuteW(
              GetHandle(), L"open", directory.c_str(), nullptr, nullptr,
              SW_SHOWNORMAL));
          if (status <= 32) {
            result->Error("open_failed", "无法打开 Neo Ledger 数据目录");
          } else {
            result->Success();
          }
          return;
        }

        if (call.method_name() == "installWindowsUpdate") {
          const auto* arguments =
              std::get_if<flutter::EncodableMap>(call.arguments());
          if (arguments == nullptr) {
            result->Error("invalid_argument", "缺少安装器路径");
            return;
          }
          const auto path_value = arguments->find(
              flutter::EncodableValue("installerPath"));
          if (path_value == arguments->end()) {
            result->Error("invalid_argument", "缺少安装器路径");
            return;
          }
          const auto* path_string =
              std::get_if<std::string>(&path_value->second);
          if (path_string == nullptr || path_string->empty()) {
            result->Error("invalid_argument", "安装器路径无效");
            return;
          }

          const auto installer = WideFromUtf8(*path_string);
          const std::filesystem::path installer_path(installer);
          if (!std::filesystem::exists(installer_path) ||
              !IsDirectChildOf(installer_path, TempDirectory()) ||
              !IsNeoWindowsInstaller(installer_path)) {
            result->Error("invalid_argument", "安装器路径或文件名不受信任");
            return;
          }

          const auto status = reinterpret_cast<INT_PTR>(ShellExecuteW(
              GetHandle(), L"open", installer_path.c_str(),
              L"/CLOSEAPPLICATIONS /NORESTART", nullptr, SW_SHOWNORMAL));
          if (status <= 32) {
            result->Error("install_failed", "无法启动 Windows 安装器");
          } else {
            result->Success();
          }
          return;
        }

        result->NotImplemented();
      });
}

void FlutterWindow::ConfigureTrayIcon() {
  tray_icon_ = {};
  tray_icon_.cbSize = sizeof(NOTIFYICONDATAW);
  tray_icon_.hWnd = GetHandle();
  tray_icon_.uID = IDI_APP_ICON;
  tray_icon_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  tray_icon_.uCallbackMessage = kTrayCallbackMessage;
  tray_icon_.hIcon = static_cast<HICON>(LoadImageW(
      GetModuleHandle(nullptr), MAKEINTRESOURCEW(IDI_APP_ICON), IMAGE_ICON,
      0, 0, LR_DEFAULTSIZE));
  wcscpy_s(tray_icon_.szTip, L"Neo Ledger");
  tray_icon_added_ = Shell_NotifyIconW(NIM_ADD, &tray_icon_) == TRUE;
  if (tray_icon_added_) {
    tray_icon_.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &tray_icon_);
  }
}

void FlutterWindow::RemoveTrayIcon() {
  if (tray_icon_added_) {
    Shell_NotifyIconW(NIM_DELETE, &tray_icon_);
  }
  tray_icon_added_ = false;
  if (tray_icon_.hIcon != nullptr) {
    DestroyIcon(tray_icon_.hIcon);
    tray_icon_.hIcon = nullptr;
  }
}

void FlutterWindow::HandleDroppedFiles(HDROP drop) {
  if (flutter_controller_ == nullptr) {
    DragFinish(drop);
    return;
  }

  const UINT count = DragQueryFileW(drop, 0xFFFFFFFF, nullptr, 0);
  flutter::EncodableList files;
  files.reserve(count);
  for (UINT index = 0; index < count; ++index) {
    const UINT length = DragQueryFileW(drop, index, nullptr, 0);
    std::wstring path(length + 1, L'\0');
    DragQueryFileW(drop, index, path.data(), length + 1);
    path.resize(length);
    files.emplace_back(Utf8FromWide(path));
  }
  DragFinish(drop);
  if (platform_channel_) {
    platform_channel_->InvokeMethod(
        "filesDropped",
        std::make_unique<flutter::EncodableValue>(flutter::EncodableValue(files)));
  }
}

void FlutterWindow::ShowTrayMenu() {
  const HMENU menu = CreatePopupMenu();
  if (menu == nullptr) return;
  AppendMenuW(menu, MF_STRING, kTrayOpenCommand, L"打开 Neo Ledger");
  AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
  AppendMenuW(menu, MF_STRING, kTrayExitCommand, L"退出");

  POINT cursor;
  GetCursorPos(&cursor);
  SetForegroundWindow(GetHandle());
  TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN, cursor.x, cursor.y,
                 0, GetHandle(), nullptr);
  PostMessage(GetHandle(), WM_NULL, 0, 0);
  DestroyMenu(menu);
}

std::string FlutterWindow::Utf8FromWide(const std::wstring& value) {
  if (value.empty()) return {};
  const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
                                        value.c_str(),
                                        static_cast<int>(value.size()), nullptr,
                                        0, nullptr, nullptr);
  if (length <= 0) return {};
  std::string result(length, '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.c_str(),
                      static_cast<int>(value.size()), result.data(), length,
                      nullptr, nullptr);
  return result;
}

std::wstring FlutterWindow::WideFromUtf8(const std::string& value) {
  if (value.empty()) return {};
  const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                         value.c_str(),
                                         static_cast<int>(value.size()),
                                         nullptr, 0);
  if (length <= 0) return {};
  std::wstring result(length, L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(),
                      static_cast<int>(value.size()), result.data(), length);
  return result;
}

LRESULT FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                                      WPARAM const wparam,
                                      LPARAM const lparam) noexcept {
  switch (message) {
    case WM_DROPFILES:
      HandleDroppedFiles(reinterpret_cast<HDROP>(wparam));
      return 0;

    case kTrayCallbackMessage:
      switch (LOWORD(lparam)) {
        case WM_RBUTTONUP:
        case WM_CONTEXTMENU:
          ShowTrayMenu();
          return 0;
        case WM_LBUTTONDBLCLK:
          Show();
          SetForegroundWindow(hwnd);
          return 0;
      }
      break;

    case WM_COMMAND:
      switch (LOWORD(wparam)) {
        case kTrayOpenCommand:
          Show();
          SetForegroundWindow(hwnd);
          return 0;
        case kTrayExitCommand:
          suppress_close_ = true;
          PostMessage(hwnd, WM_CLOSE, 0, 0);
          return 0;
      }
      break;

    case WM_CLOSE:
      if (!suppress_close_) {
        ShowWindow(hwnd, SW_HIDE);
        return 0;
      }
      suppress_close_ = false;
      break;
  }

  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_FONTCHANGE:
      if (flutter_controller_ && flutter_controller_->engine()) {
        flutter_controller_->engine()->ReloadSystemFonts();
      }
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
