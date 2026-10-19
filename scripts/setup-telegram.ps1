$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'Create your bot with @BotFather /newbot first. Do not paste the token in chat.'
$botSecret = Read-Host 'Bot token (hidden)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($botSecret)
try {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = (Get-Command node -ErrorAction Stop).Source
    $startInfo.ArgumentList.Add((Join-Path $PSScriptRoot 'setup-telegram.mjs'))
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
