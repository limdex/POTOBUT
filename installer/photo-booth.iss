; PhotoBooth Installer Script for Inno Setup
; Requires Inno Setup 6.0+ (https://jrsoftware.org/isinfo.php)
;
; BUILD INSTRUCTIONS:
; 1. Install Inno Setup 6 from https://jrsoftware.org/isdl.php
; 2. Run: powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
; 3. Find output in: installer\installer-output\PhotoBoothSetup.exe

#define MyAppName "Photo Booth"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "PhotoBooth"
#define MyAppURL "https://github.com/yourusername/potobut"
#define MyAppExeName "PhotoBooth.bat"

[Setup]
AppId={{B1E53D0A-7K2D-4F9E-8C1A-2D3E4F5A6B7C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\PhotoBooth
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer-output
OutputBaseFilename=PhotoBoothSetup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Main application files - built SvelteKit app
Source: "..\build\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Node.js runtime (portable)
Source: "runtime\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs

; Launcher script
Source: "PhotoBooth.bat"; DestDir: "{app}"; Flags: ignoreversion

; Initial database (if exists)
Source: "..\database\initial.sqlite"; DestDir: "{app}\database"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
const
  WM_CLOSE = $0010;

procedure InitializeWizard;
begin
  // Custom welcome page could be added here if needed
end;

function InitializeSetup: Boolean;
begin
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  DataDir: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Create user data directory
    DataDir := ExpandConstant('{localappdata}\PhotoBooth');
    CreateDir(DataDir);
    CreateDir(DataDir + '\photos');
    CreateDir(DataDir + '\logs');
    
    // Create config.json with default settings
    SaveStringToFile(DataDir + '\config.json', 
      '{' + #13#10 +
      '  "server": {' + #13#10 +
      '    "port": 5173,' + #13#10 +
      '    "host": "localhost"' + #13#10 +
      '  },' + #13#10 +
      '  "camera": {' + #13#10 +
      '    "type": "auto"' + #13#10 +
      '  },' + #13#10 +
      '  "printer": {' + #13#10 +
      '    "name": "default"' + #13#10 +
      '  }' + #13#10 +
      '}', False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // Ask user if they want to keep photos and database
    if MsgBox('Do you want to keep your photos and settings?', 
              mbConfirmation, MB_YESNO) = IDNO then
    begin
      DataDir := ExpandConstant('{localappdata}\PhotoBooth');
      DelTree(DataDir, True, True, True);
    end;
  end;
end;
