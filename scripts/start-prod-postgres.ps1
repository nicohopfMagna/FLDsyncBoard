$scriptPath = Join-Path $PSScriptRoot "start-docker.ps1"
& $scriptPath -EnvFile ".env.prod.postgres" -ComposeProfile "postgres" -Action "up"
