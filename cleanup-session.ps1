# Removes session artifacts before pushing. Dry-run by default. Run from the repo root.
# Actually delete with: .\cleanup-session.ps1 -Force

param([switch]$Force)

$ErrorActionPreference = 'Stop'

$repoRoot = (Get-Location).Path
$pkgPath = Join-Path $repoRoot 'package.json'

if (-not (Test-Path $pkgPath)) { Write-Host "No package.json in $repoRoot. Run from the repo root." -ForegroundColor Red; exit 1 }

$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.name -ne 'trovarci-sh') { Write-Host "package.json name is '$($pkg.name)', expected 'trovarci-sh'. Aborting." -ForegroundColor Red; exit 1 }

# Explicit list. No wildcards that could reach source directories.
$targets = @(
  'pricing-consumers.zip',
  'trovarci-mv-context.zip',
  'trovarcis-copy-sweep.zip',
  'trovarcis-mv-adapter.zip',
  'trovarcis-refund-rule.zip',
  'trovarci-sh-tree.txt',
  'collect-mv-context.ps1',
  'scripts/mvRaw.mjs'
)

# Backup folders created by the installers this session.
$backupDirs = Get-ChildItem -Path $repoRoot -Directory |
  Where-Object { $_.Name -match '^_(pricing|pricing-consumers|flat-pricing|copy-sweep|mv-adapter|refund-rule|pricing-1m|mv-context-staging)' }

$found = @()

foreach ($rel in $targets) {
  $p = Join-Path $repoRoot ($rel -replace '/', '\')
  if (Test-Path $p) { $found += ,@($rel, 'file', (Get-Item $p).Length) }
}

foreach ($d in $backupDirs) {
  $size = (Get-ChildItem $d.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum
  $found += ,@($d.Name, 'folder', $size)
}

if ($found.Count -eq 0) { Write-Host "Nothing to clean." -ForegroundColor Green; exit 0 }

Write-Host "`nWill remove $($found.Count) item(s):`n" -ForegroundColor Cyan
foreach ($f in $found) {
  $kb = [math]::Round($f[2] / 1KB, 1)
  Write-Host ("  {0,-6} {1,-45} {2,8} KB" -f $f[1], $f[0], $kb) -ForegroundColor Yellow
}

$totalKb = [math]::Round((($found | ForEach-Object { $_[2] }) | Measure-Object -Sum).Sum / 1KB, 1)
Write-Host "`n  Total: $totalKb KB" -ForegroundColor Cyan

if (-not $Force) {
  Write-Host "`nDry run. Nothing deleted. Rerun with -Force to remove." -ForegroundColor Cyan
  exit 0
}

foreach ($rel in $targets) {
  $p = Join-Path $repoRoot ($rel -replace '/', '\')
  if (Test-Path $p) { Remove-Item -LiteralPath $p -Force; Write-Host "  removed $rel" -ForegroundColor Green }
}

foreach ($d in $backupDirs) {
  if ($d.FullName -eq $repoRoot) { continue }
  Remove-Item -LiteralPath $d.FullName -Recurse -Force
  Write-Host "  removed $($d.Name)/" -ForegroundColor Green
}

Write-Host "`nDone. Check with: git status" -ForegroundColor Cyan
