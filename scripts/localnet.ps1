param(
    [ValidateSet('start', 'status', 'logs')]
    [string]$Action = 'start',
    [string]$QuickstartDir = (Join-Path $PSScriptRoot '..\.localnet\cn-quickstart')
)

$ErrorActionPreference = 'Stop'
$revision = '374f2d6e04f66ab919a2fab27401834235ccecd9'
$quickstart = [System.IO.Path]::GetFullPath($QuickstartDir)

if (-not (Test-Path (Join-Path $quickstart '.git'))) {
    if ($Action -ne 'start') {
        throw "QuickStart not found at $quickstart. Run this script with -Action start first."
    }
    if (Test-Path $quickstart) {
        throw "Refusing to overwrite existing directory: $quickstart"
    }
    git -c core.autocrlf=false clone https://github.com/digital-asset/cn-quickstart.git $quickstart
    if ($LASTEXITCODE -ne 0) { throw 'Cloning cn-quickstart failed.' }
    git -C $quickstart checkout --detach $revision
    if ($LASTEXITCODE -ne 0) { throw 'Checking out the pinned cn-quickstart revision failed.' }
}

$actual = git -C $quickstart rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $revision) {
    throw "QuickStart must be at revision $revision; found $actual."
}

$root = Join-Path $quickstart 'quickstart'
$env:MODULES_DIR = Join-Path $root 'docker\modules'
$env:LOCALNET_DIR = Join-Path $env:MODULES_DIR 'localnet'
$env:LOCALNET_ENV_DIR = Join-Path $env:LOCALNET_DIR 'env'
$env:IMAGE_TAG = '0.9.4'
$env:AUTH_MODE = 'shared-secret'
$env:TEST_MODE = 'off'

$compose = @(
    'compose', '--project-name', 'canton-auction',
    '--env-file', (Join-Path $root '.env'),
    '--env-file', (Join-Path $env:LOCALNET_DIR 'compose.env'),
    '--env-file', (Join-Path $env:LOCALNET_ENV_DIR 'common.env'),
    '--env-file', (Join-Path $env:MODULES_DIR 'pqs\compose.env'),
    '-f', (Join-Path $env:LOCALNET_DIR 'compose.yaml'),
    '-f', (Join-Path $env:LOCALNET_DIR 'resource-constraints.yaml'),
    '-f', (Join-Path $env:MODULES_DIR 'splice-onboarding\compose.yaml'),
    '-f', (Join-Path $env:MODULES_DIR 'pqs\compose.yaml'),
    '-f', (Join-Path $env:MODULES_DIR 'pqs\resource-constraints.yaml'),
    '-f', (Join-Path $PSScriptRoot 'localnet-ports.yaml'),
    '--profile', 'sv', '--profile', 'app-provider', '--profile', 'app-user',
    '--profile', 'pqs-app-provider'
)

switch ($Action) {
    'start' { docker @compose up -d }
    'status' { docker @compose ps -a }
    'logs' { docker @compose logs --tail 100 pqs-app-provider }
}
if ($LASTEXITCODE -ne 0) { throw "LocalNet $Action failed (exit $LASTEXITCODE)." }
