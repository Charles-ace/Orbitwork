$genlayerPath = "C:\Users\akpan\AppData\Roaming\npm\node_modules\genlayer\dist\index.js"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = "`"$genlayerPath`" init --headless --ollama"
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false

Write-Host "Starting genlayer init..."
$p = [System.Diagnostics.Process]::Start($psi)

Start-Sleep -Seconds 2

# Send Y for confirmation
$p.StandardInput.WriteLine("Y")
Start-Sleep -Milliseconds 500

# Send space then enter for the checkbox (selects Ollama)
$p.StandardInput.Write(" ")  # space to select
Start-Sleep -Milliseconds 200
$p.StandardInput.WriteLine("")  # enter to submit
Start-Sleep -Milliseconds 200

# For API key prompt (Ollama doesn't need one, so just send empty enter)
$p.StandardInput.WriteLine("")

$p.StandardInput.Close()

$output = $p.StandardOutput.ReadToEnd()
$error = $p.StandardError.ReadToEnd()

$p.WaitForExit(600000)

Write-Host "Exit code: $($p.ExitCode)"
Write-Host "Output: $output"
if ($error) { Write-Host "Errors: $error" }
