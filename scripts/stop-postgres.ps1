$scriptPath = Join-Path $PSScriptRoot "start-docker.ps1"
& $scriptPath -EnvFile ".env.postgres" -ComposeProfile "postgres" -Action "down"
