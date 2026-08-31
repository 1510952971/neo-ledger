; Neo Ledger Windows installer.
; CI supplies these values so the installer always matches pubspec.yaml.
#define AppVersion GetEnv("NEO_LEDGER_VERSION")
#define BuildDir GetEnv("NEO_LEDGER_WINDOWS_BUILD_DIR")
#define OutputDir GetEnv("NEO_LEDGER_WINDOWS_OUTPUT_DIR")

[Setup]
AppId={{37F6CB3E-0D4F-4F53-9DA0-8B4D05E8E4D9}
AppName=Neo Ledger
AppVersion={#AppVersion}
AppVerName=Neo Ledger {#AppVersion}
AppPublisher=Neo Ledger
AppPublisherURL=https://github.com/1510952971/neo-ledger
AppSupportURL=https://github.com/1510952971/neo-ledger/issues
DefaultDirName={localappdata}\Programs\Neo Ledger
DefaultGroupName=Neo Ledger
UninstallDisplayName=Neo Ledger
UninstallDisplayIcon={app}\neo_ledger.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=neo-ledger-windows-{#AppVersion}-setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
SetupIconFile=..\runner\resources\app_icon.ico
VersionInfoCompany=Neo Ledger
VersionInfoDescription=Neo Ledger unified ledger client
VersionInfoProductName=Neo Ledger
VersionInfoProductVersion={#AppVersion}
VersionInfoCopyright=Neo Ledger

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "{#BuildDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{userprograms}\Neo Ledger"; Filename: "{app}\neo_ledger.exe"
Name: "{userdesktop}\Neo Ledger"; Filename: "{app}\neo_ledger.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\neo_ledger.exe"; Description: "Launch Neo Ledger"; Flags: postinstall nowait skipifsilent
