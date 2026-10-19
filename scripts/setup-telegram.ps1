$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'Node.js 24 or later is required. Install Node.js, reopen PowerShell, and run setup again.'
}
$nodeVersion = & $nodePath -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.Split('.')[0]) -lt 24) {
    throw 'Node.js 24 or later is required. Update Node.js and run setup again.'
}
Write-Host 'Create your bot with @BotFather /newbot first. Do not paste the token in chat.'
$botSecret = Read-Host 'Bot token (hidden)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($botSecret)
try {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodePath
    # Windows PowerShell 5.1 uses .NET Framework, which lacks ArgumentList.
    $startInfo.Arguments = '"' + (Join-Path $PSScriptRoot 'setup-telegram.mjs') + '"'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $setupProcess = [Diagnostics.Process]::Start($startInfo)
    $setupProcess.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer))
    $setupProcess.StandardInput.Close()
    $setupProcess.WaitForExit()
    if ($setupProcess.ExitCode -ne 0) { throw 'Telegram setup did not finish. Fix the reported step, then run this command again.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $botSecret.Dispose()
}
