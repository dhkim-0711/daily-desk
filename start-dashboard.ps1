$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$node = "C:\Program Files\nodejs\node.exe"
if (Test-Path $node) {
  & $node server.js
} else {
  node server.js
}
