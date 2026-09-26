[CmdletBinding()]
param(
    [switch]$ReadinessOnly,
    [string]$InstallPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not [string]::IsNullOrWhiteSpace($InstallPath)) {
    New-Item -ItemType Directory -Path (Split-Path $InstallPath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $PSCommandPath -Destination $InstallPath -Force
    Write-Output "Installed ElderMark automation wrapper at $InstallPath"
    return
}

$accountName = 'alamoadmin'
$pythonPath = 'C:\Users\alamoadmin\AppData\Local\Programs\Python\Python312\python.exe'
$pullScriptPath = 'C:\Users\alamoadmin\Desktop\eldermark_pull.py'
$profileHivePath = 'C:\Users\alamoadmin\NTUSER.DAT'
$runtimeHiveName = 'AlamoElderMarkRuntime'
$runtimeRoot = "Registry::HKEY_USERS\$runtimeHiveName"
$logDirectory = 'C:\ProgramData\Alamo\logs'
$logPath = Join-Path $logDirectory 'eldermark-automation.log'

$requiredEnvironmentNames = @(
    'ADLS_CONNECTION_STRING',
    'AZURE_TENANT_ID',
    'DATABRICKS_CLIENT_ID',
    'DATABRICKS_CLIENT_SECRET',
    'DATABRICKS_HOST',
    'DATABRICKS_JOB_ID',
    'ELDERMARK_PASSWORD',
    'ELDERMARK_USERNAME'
)

$loadedRuntimeHive = $false
$environmentPath = $null

function Write-AutomationLog {
    param([string]$Message)
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $timestamp = (Get-Date).ToUniversalTime().ToString('o')
    Add-Content -Path $logPath -Value "$timestamp $Message"
}

function Resolve-UserEnvironmentPath {
    $account = New-Object System.Security.Principal.NTAccount($accountName)
    $sid = $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
    $loadedUserEnvironment = "Registry::HKEY_USERS\$sid\Environment"
    if (Test-Path $loadedUserEnvironment) {
        return $loadedUserEnvironment
    }

    if (Test-Path $runtimeRoot) {
        & reg.exe unload "HKU\$runtimeHiveName" | Out-Null
    }
    & reg.exe load "HKU\$runtimeHiveName" $profileHivePath | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not load the alamoadmin user profile environment'
    }
    $script:loadedRuntimeHive = $true
    return "$runtimeRoot\Environment"
}

try {
    if (-not (Test-Path $pythonPath)) {
        throw "Python executable not found: $pythonPath"
    }
    if (-not (Test-Path $pullScriptPath)) {
        throw "ElderMark pull script not found: $pullScriptPath"
    }

    $environmentPath = Resolve-UserEnvironmentPath
    $userEnvironment = Get-ItemProperty -Path $environmentPath
    $missingNames = @()

    foreach ($name in $requiredEnvironmentNames) {
        $property = $userEnvironment.PSObject.Properties[$name]
        $value = if ($property) { [string]$property.Value } else { '' }
        if ([string]::IsNullOrWhiteSpace($value)) {
            $missingNames += $name
            continue
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }

    if ($missingNames.Count -gt 0) {
        throw "Required ElderMark automation variables are missing: $($missingNames -join ', ')"
    }

    # The governed Databricks job owns downstream processing on its 05:15 schedule.
    [Environment]::SetEnvironmentVariable('ELDERMARK_TRIGGER_DATABRICKS', '0', 'Process')

    if ($ReadinessOnly) {
        [PSCustomObject]@{
            ready = $true
            account = $accountName
            required_variable_count = $requiredEnvironmentNames.Count
            python_path_present = $true
            pull_script_present = $true
            databricks_trigger_disabled = $true
        } | ConvertTo-Json -Compress
        return
    }

    Write-AutomationLog 'ElderMark raw pull started.'
    Push-Location (Split-Path $pullScriptPath -Parent)
    try {
        & $pythonPath $pullScriptPath
        $pullExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    if ($pullExitCode -ne 0) {
        throw "ElderMark pull exited with code $pullExitCode"
    }
    Write-AutomationLog 'ElderMark raw pull completed successfully.'
} catch {
    Write-AutomationLog "ElderMark raw pull failed: $($_.Exception.Message)"
    throw
} finally {
    foreach ($name in ($requiredEnvironmentNames + 'ELDERMARK_TRIGGER_DATABRICKS')) {
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    if ($loadedRuntimeHive) {
        [gc]::Collect()
        [gc]::WaitForPendingFinalizers()
        & reg.exe unload "HKU\$runtimeHiveName" | Out-Null
    }
}
