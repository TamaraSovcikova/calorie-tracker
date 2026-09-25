<#
.SYNOPSIS
  Reverse the changes made by wsl-lan-setup.ps1 - remove the netsh
  portproxy entry and the firewall rule.

.DESCRIPTION
  Safe to run even if the rule or proxy doesn't exist.
  Must be run from an elevated PowerShell window (Run as administrator).
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
  Write-Error "This script must be run as Administrator."
  exit 1
}

# Remove the portproxy
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
Write-Host "portproxy : removed (if it existed)" -ForegroundColor Green

# Remove the firewall rule
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Remove-NetFirewallRule -DisplayName $RuleName
  Write-Host "firewall  : removed rule '$RuleName'" -ForegroundColor Green
} else {
  Write-Host "firewall  : no rule '$RuleName' to remove" -ForegroundColor DarkGray
}
