$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
    $artifactDir = Join-Path $projectRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
    $releaseName = 'everywhere-tools-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tar.gz'
    $archivePath = Join-Path $artifactDir $releaseName
    # Explicit allowlist: no user data, credentials, node_modules, or local logs.
    tar -czf $archivePath dist server.js chat-server.js package.json package-lock.json deploy/production
    if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }
    $checksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath ($archivePath + '.sha256') -Value ($checksum + '  ' + $releaseName) -Encoding ascii
    Write-Output ('Release: ' + $archivePath)
} finally { Pop-Location }
