$scriptPath = Join-Path $PSScriptRoot "start-docker.ps1"
& $scriptPath -EnvFile ".env.prod" -Action "up"
