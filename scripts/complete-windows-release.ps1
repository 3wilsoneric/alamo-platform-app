# Create a deferrable update feed only after Windows trusts the signed package.
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $StageRoot,
    [Parameter(Mandatory)] [uri] $PublishBaseUrl
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Signature verification requires Windows.' }
if ($PublishBaseUrl.Scheme -ne 'https' -or $PublishBaseUrl.UserInfo -or $PublishBaseUrl.Query -or $PublishBaseUrl.Fragment) {
    throw 'Use an HTTPS download directory without credentials, query, or fragment.'
}
$stage = (Resolve-Path -LiteralPath $StageRoot).Path
$receipt = Get-Content -LiteralPath (Join-Path $stage 'pwabuilder.receipt.json') -Raw | ConvertFrom-Json
if ($receipt.status -ne 'candidate_only' -or $receipt.bundle_file -cnotmatch '^AlamoHealthPlatform-[0-9.]+\.msixbundle$') {
    throw 'Unexpected package receipt.'
}
$bundle = Join-Path $stage $receipt.bundle_file
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -LiteralPath $sdkRoot -Directory |
    Where-Object Name -Match '^10\.0\.\d+\.0$' |
    Sort-Object { [version] $_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $signTool) { throw 'Windows SDK SignTool is required.' }
& $signTool verify /pa /all /v $bundle
if ($LASTEXITCODE -ne 0) { throw 'Windows did not trust the package signature. No feed was created.' }

$base = $PublishBaseUrl.AbsoluteUri.TrimEnd('/') + '/'
$escape = { param([string] $value) [Security.SecurityElement]::Escape($value) }
$packageUri = & $escape ($base + $receipt.bundle_file)
$feedUri = & $escape ($base + 'AlamoHealthPlatform.appinstaller')
$publisher = & $escape $receipt.bundle_publisher
$name = & $escape $receipt.identity.Name
$version = & $escape $receipt.identity.Version
@"
<?xml version="1.0" encoding="utf-8"?>
<AppInstaller xmlns="http://schemas.microsoft.com/appx/appinstaller/2018" Version="$version" Uri="$feedUri">
  <MainBundle Name="$name" Publisher="$publisher" Version="$version" Uri="$packageUri" />
  <UpdateSettings><OnLaunch HoursBetweenUpdateChecks="8" ShowPrompt="true" UpdateBlocksActivation="false" /></UpdateSettings>
</AppInstaller>
"@ | Set-Content -LiteralPath (Join-Path $stage 'AlamoHealthPlatform.appinstaller') -Encoding utf8NoBOM
@{
    signed = $true
    bundle_file = $receipt.bundle_file
    bundle_sha256 = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
    source_commit = $receipt.source_commit
    run_id = $receipt.run_id
    run_attempt = $receipt.run_attempt
    package_id = $receipt.identity.Name
    publisher = $receipt.bundle_publisher
    version = $receipt.identity.Version
    feed_url = $base + 'AlamoHealthPlatform.appinstaller'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'signed-release.json') -Encoding utf8NoBOM
Write-Host 'Windows trusted the package. Upload the immutable bundle before the update feed.'
