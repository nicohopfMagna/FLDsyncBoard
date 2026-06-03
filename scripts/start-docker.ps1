param(
  [Parameter(Mandatory = $false)]
  [string]$EnvFile = ".env",

  [Parameter(Mandatory = $false)]
  [string]$ComposeProfile = "",

  [Parameter(Mandatory = $false)]
  [ValidateSet("up", "down")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"

function Resolve-DockerExecutable {
  $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($dockerCmd) {
    return $dockerCmd.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\resources\bin\docker.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Resolve-ComposeCommand {
  $dockerExe = Resolve-DockerExecutable
  if ($dockerExe) {
    try {
      & $dockerExe compose version *> $null
      if ($LASTEXITCODE -eq 0) {
        return @{ Cmd = $dockerExe; Prefix = @("compose") }
      }
    } catch {
      # Continue to error below.
    }
  }

  return $null
}

if (-not (Resolve-DockerExecutable)) {
  Write-Host "Docker is not installed or not available in PATH." -ForegroundColor Red
  Write-Host "Install Docker Desktop first, then retry." -ForegroundColor Yellow
  exit 1
}

$dockerExe = Resolve-DockerExecutable
try {
  & $dockerExe info *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker daemon is not reachable." -ForegroundColor Red
    Write-Host "Start Docker Desktop and retry. If required, run this shell with elevated privileges." -ForegroundColor Yellow
    exit $LASTEXITCODE
  }
} catch {
  Write-Host "Docker daemon is not reachable." -ForegroundColor Red
  Write-Host "Start Docker Desktop and retry. If required, run this shell with elevated privileges." -ForegroundColor Yellow
  exit 1
}

$compose = Resolve-ComposeCommand
if (-not $compose) {
  Write-Host "Docker Compose is not available." -ForegroundColor Red
  Write-Host "Install Docker Desktop with Compose support, then retry." -ForegroundColor Yellow
  exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot $EnvFile
if (-not (Test-Path $envPath)) {
  Write-Host "Environment file not found: $envPath" -ForegroundColor Red
  exit 1
}

Push-Location $repoRoot
try {
  $env:ENV_FILE = $EnvFile
  $profileArgs = @()
  if ($ComposeProfile -and $ComposeProfile.Trim()) {
    $profileArgs = @("--profile", $ComposeProfile.Trim())
  }

  if ($Action -eq "up") {
    Write-Host "Starting containers with env file: $EnvFile" -ForegroundColor Cyan
    & $compose.Cmd @($compose.Prefix + $profileArgs + @("up", "--build", "-d"))
  } else {
    Write-Host "Stopping containers with env file: $EnvFile" -ForegroundColor Cyan
    & $compose.Cmd @($compose.Prefix + $profileArgs + @("down"))
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Host "Compose command failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
  }

  Write-Host "Done." -ForegroundColor Green
} finally {
  Pop-Location
}
