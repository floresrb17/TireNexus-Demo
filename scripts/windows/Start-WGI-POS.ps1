$ErrorActionPreference = "SilentlyContinue"

$appUrl = "http://127.0.0.1:23865/"
$apiUrl = "http://127.0.0.1:8080/api/healthz"
$project = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$apiLog = Join-Path $project "local-data\local-api.log"
$appLog = Join-Path $project "local-data\vite.log"
$appProfile = Join-Path $project "local-data\app-window-profile"

function Open-WgiPosApp($url) {
  $edgePaths = @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($edgePath in $edgePaths) {
    if (Test-Path $edgePath) {
      Start-Process -FilePath $edgePath -ArgumentList @(
        "--app=$url",
        "--user-data-dir=$appProfile",
        "--no-first-run",
        "--disable-features=msEdgeSidebarV2"
      )
      return
    }
  }

  Start-Process $url
}

function Test-Url($url) {
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Url $apiUrl)) {
  $apiCommand = "cd /d `"$project`" && node local-api.cjs > `"$apiLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/s", "/c", $apiCommand -WindowStyle Hidden
}

if (-not (Test-Url $appUrl)) {
  $appCommand = "cd /d `"$project`" && set PORT=23865&& set BASE_PATH=/&& set API_PROXY_TARGET=http://127.0.0.1:8080&& pnpm --filter @workspace/tireshop-pos run dev > `"$appLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/s", "/c", $appCommand -WindowStyle Hidden
}

for ($i = 0; $i -lt 80; $i++) {
  if ((Test-Url $apiUrl) -and (Test-Url $appUrl)) {
    Open-WgiPosApp $appUrl
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Start-Process "notepad.exe" $appLog
