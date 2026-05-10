<#
.SYNOPSIS
  Forward port 5173 (Vite dev server) from the Windows LAN interface to
  WSL2 so a phone on the same Wi-Fi can hit the dev server.

.DESCRIPTION
  Two paths:
    1. WSL2 mirrored networking (recommended on Win11 22H2+) — handled
       outside this script: edit %USERPROFILE%\.wslconfig, add
       `[wsl2]\nnetworkingMode=mirrored\n`, then `wsl --shutdown`.
    2. Classic netsh portproxy + firewall rule (this script). Re-run after
       WSL restarts because the WSL VM IP changes.

  Must be run from an elevated PowerShell window (Run as administrator).

.NOTES
  After running this script:
    - Open Vite's "Network" URL using the Windows LAN IP printed at the end,
      not the WSL IP that vite shows in its banner.
    - On the phone, type the URL with the explicit `http://` prefix —
      Chrome may otherwise auto-upgrade to HTTPS, which the dev server
      doesn't speak.

  To remove the rules later, run scripts\wsl-lan-teardown.ps1.
#>

[CmdletBinding()]
param(
  [int]$Port = 5173,
  [string]$RuleName = 'WSL2 Vite Dev (5173)'
)

$ErrorActionPreference = 'Stop'

function Test-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Error "This script must be run as Administrator. Right-click PowerShell -> 'Run as administrator', then try again."
  exit 1
}

# 1. Discover the WSL VM IP
$wslIp = (wsl hostname -I).Trim().Split(' ')[0]
if (-not $wslIp) {
  Write-Error "Could not detect WSL2 IP. Is WSL running? Try `wsl -d Ubuntu` first."
  exit 1
}
Write-Host "WSL2 IP : $wslIp" -ForegroundColor Cyan

# 2. Drop any existing portproxy on the same listenport, then add ours
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp | Out-Null
Write-Host "portproxy : 0.0.0.0:$Port -> $wslIp:$Port" -ForegroundColor Green

# 3. Ensure a firewall rule allows inbound on that port
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "firewall  : rule '$RuleName' already exists, leaving as-is" -ForegroundColor Green
} else {
  New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow -Profile Private,Domain | Out-Null
  Write-Host "firewall  : added rule '$RuleName' (inbound, TCP $Port, Private+Domain profiles)" -ForegroundColor Green
}

# 4. Print the Windows LAN IPv4 to type into the phone
$lanCandidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.PrefixOrigin -eq 'Dhcp' -and
    $_.IPAddress -notmatch '^169\.254\.' -and
    $_.IPAddress -notmatch '^127\.' -and
    $_.InterfaceAlias -notmatch 'WSL|vEthernet|Loopback'
  } |
  Sort-Object -Property InterfaceMetric

if (-not $lanCandidates) {
  Write-Warning "Couldn't auto-detect a LAN IP. Run `ipconfig` and look for your Wi-Fi adapter's IPv4 address."
} else {
  $primary = $lanCandidates[0]
  Write-Host ""
  Write-Host "Phone URL: http://$($primary.IPAddress):$Port" -ForegroundColor Yellow
  Write-Host "  (interface: $($primary.InterfaceAlias))"
  if ($lanCandidates.Count -gt 1) {
    Write-Host ""
    Write-Host "Other candidate addresses (in case the first doesn't work):"
    foreach ($cand in $lanCandidates | Select-Object -Skip 1) {
      Write-Host "  http://$($cand.IPAddress):$Port  ($($cand.InterfaceAlias))"
    }
  }
}

Write-Host ""
Write-Host "Phone gotcha: Chrome may force HTTPS. Type the URL with the explicit"
Write-Host "  http://  prefix, or disable Settings -> Privacy -> 'Always use secure"
Write-Host "  connections' for plain-IP origins."
Write-Host ""
Write-Host "When done testing, run scripts\wsl-lan-teardown.ps1 to clean up."
