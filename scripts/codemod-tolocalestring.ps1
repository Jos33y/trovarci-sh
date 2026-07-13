# codemod-tolocalestring.ps1 - Migrate .toLocaleString() to formatInt() from ~/utils/format.
# Preview by default. Run with -Apply to write files. Uses git for rollback.
# Run: .\scripts\codemod-tolocalestring.ps1              (preview - no writes)
# Run: .\scripts\codemod-tolocalestring.ps1 -Apply       (write files)

param(
    [switch]$Apply,
    [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

# ----- Validate repo -----

$pkgPath = Join-Path $Root 'package.json'
if (-not (Test-Path $pkgPath)) {
    Write-Host "[FAIL] package.json not found at $pkgPath" -ForegroundColor Red
    exit 1
}
try {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "[FAIL] Could not parse package.json: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
if ($pkg.name -ne 'trovarci-sh') {
    Write-Host "[FAIL] package.json name is '$($pkg.name)', expected 'trovarci-sh'" -ForegroundColor Red
    Write-Host "       Refusing to modify files - are you in the right repo?" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Repo verified: $($pkg.name)" -ForegroundColor Green

# ----- Scope -----

$scanDirs = @(
    (Join-Path $Root 'app/routes'),
    (Join-Path $Root 'app/components')
)
$skipFilenames = @(
    'api.tools.verify-email-bulk.js',
    'api.tools.verify-number-bulk.js'
)

$files = @()
foreach ($dir in $scanDirs) {
    if (-not (Test-Path $dir)) { continue }
    $files += Get-ChildItem -Path $dir -Recurse -Include '*.jsx','*.js' -File
}
$files = @($files | Where-Object { $skipFilenames -notcontains $_.Name } | Sort-Object FullName)

Write-Host "Scanning $($files.Count) files under app/routes and app/components..."
Write-Host ""

# ----- Regex -----
# All character classes exclude \r\n so matches never span line boundaries. Multi-line calls (rare) will
# not match; user reformats or handles manually. This keeps preview display and line-number tracking honest
# even when the file has expressions spread over several lines.

# Chain: foo.bar.baz.method(args).toLocaleString() with . ?. [] and balanced (args), single-line only
$chainPattern = [regex]'(?<chain>[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\?\.|\.)[A-Za-z_$][A-Za-z0-9_$]*|\[[^\]\r\n]+\]|\((?:[^()\r\n]|(?<L2>\()|(?<-L2>\)))*(?(L2)(?!))\))*)\??\.toLocaleString\(\s*(?:''en-US''|"en-US")?\s*\)'

# Paren: (expr).toLocaleString() with balanced parens, single-line only
$parenPattern = [regex]'\((?<expr>(?:[^()\r\n]|(?<L>\()|(?<-L>\)))*(?(L)(?!)))\)\??\.toLocaleString\(\s*(?:''en-US''|"en-US")?\s*\)'

# Date-formatting calls (options object present) - flag but do not replace
$datePattern  = [regex]'\.toLocaleString\(\s*(?:undefined|''[a-z]{2}-[A-Z]{2}''|"[a-z]{2}-[A-Z]{2}")\s*,\s*\{'

# Existing named import from ~/utils/format (for merge)
$namedImportPattern = [regex]'(?m)^(?<pre>import\s*\{)(?<names>[^}]+)(?<post>\}\s*from\s*[''"]~/utils/format[''"];?)'

# ----- Helpers -----

function Get-RelativePath($fullPath) {
    $rel = $fullPath.Substring($Root.Length).TrimStart('\','/')
    return $rel -replace '\\','/'
}

function Get-LineNumber($content, $index) {
    if ($index -le 0) { return 1 }
    $substring = $content.Substring(0, $index)
    return ($substring.Split("`n").Count)
}

function Get-LineAt($content, $lineNumber) {
    $lines = $content.Split("`n")
    if ($lineNumber -le 0 -or $lineNumber -gt $lines.Count) { return '' }
    return $lines[$lineNumber - 1]
}

function Invoke-FileProcessing($fullPath) {
    $original = [System.IO.File]::ReadAllText($fullPath)

    # Fast skip if no toLocaleString calls at all
    if ($original -notmatch '\.toLocaleString\(') {
        return $null
    }

    # Detect date-formatting calls (flag only, do not replace)
    $dateFlags = @()
    foreach ($m in $datePattern.Matches($original)) {
        $ln = Get-LineNumber $original $m.Index
        $dateFlags += [PSCustomObject]@{
            LineNumber = $ln
            Line = (Get-LineAt $original $ln).Trim()
        }
    }

    $modified = $original
    $totalReplacements = 0
    $affectedLines = [System.Collections.Generic.HashSet[int]]::new()

    # Pass 1: identifier chains MUST run first. Chain grabs full method chains including inner call args,
    # so `Math.round(v).toLocaleString()` correctly captures `Math.round(v)` as the subject. Paren-first
    # would incorrectly grab the inner `(v)` and produce `Math.roundformatInt(v)`.
    $chainMatches = @($chainPattern.Matches($modified))
    $totalReplacements += $chainMatches.Count
    foreach ($m in $chainMatches) {
        $ln = Get-LineNumber $original $m.Index
        [void]$affectedLines.Add($ln)
    }
    for ($i = $chainMatches.Count - 1; $i -ge 0; $i--) {
        $m = $chainMatches[$i]
        $chain = $m.Groups['chain'].Value.Trim()
        $modified = $modified.Substring(0, $m.Index) + "formatInt($chain)" + $modified.Substring($m.Index + $m.Length)
    }

    # Pass 2: parenthesized subjects that chain could not touch (start with `(`, not identifier).
    # Runs against $modified because chain may have shifted positions, but since all regex classes are
    # single-line, line count is preserved and line numbers stay consistent between $original and $modified.
    $parenMatches = @($parenPattern.Matches($modified))
    $totalReplacements += $parenMatches.Count
    foreach ($m in $parenMatches) {
        $ln = Get-LineNumber $modified $m.Index
        [void]$affectedLines.Add($ln)
    }
    for ($i = $parenMatches.Count - 1; $i -ge 0; $i--) {
        $m = $parenMatches[$i]
        $expr = $m.Groups['expr'].Value.Trim()
        $modified = $modified.Substring(0, $m.Index) + "formatInt($expr)" + $modified.Substring($m.Index + $m.Length)
    }

    # Safety filter: only keep affected lines where the original ACTUALLY contains toLocaleString.
    # Belt-and-braces catch for any regex edge case that might record a line without a real match.
    $verifiedLines = @()
    foreach ($ln in ($affectedLines | Sort-Object)) {
        $line = Get-LineAt $original $ln
        if ($line -match '\.toLocaleString\(') {
            $verifiedLines += $ln
        }
    }

    # Build change entries: one per verified affected line, showing true original -> true final.
    $changes = @()
    foreach ($ln in $verifiedLines) {
        $before = (Get-LineAt $original $ln).Trim()
        $after = (Get-LineAt $modified $ln).Trim()
        $changes += [PSCustomObject]@{
            LineNumber = $ln
            Original = $before
            Replacement = $after
        }
    }

    # Add or update import from ~/utils/format (may shift line numbers, done last)
    if ($totalReplacements -gt 0) {
        if ($namedImportPattern.IsMatch($modified)) {
            $modified = $namedImportPattern.Replace($modified, {
                param($m)
                $namesArr = $m.Groups['names'].Value.Trim() -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
                if ($namesArr -notcontains 'formatInt') {
                    $namesArr = @($namesArr) + 'formatInt'
                }
                return "$($m.Groups['pre'].Value) $($namesArr -join ', ') $($m.Groups['post'].Value)"
            }, 1)
        } else {
            $importLineMatches = [regex]::Matches($modified, '(?m)^import\s+.*$')
            if ($importLineMatches.Count -gt 0) {
                $lastImport = $importLineMatches[$importLineMatches.Count - 1]
                $insertPos = $lastImport.Index + $lastImport.Length
                $modified = $modified.Substring(0, $insertPos) + "`nimport { formatInt } from '~/utils/format';" + $modified.Substring($insertPos)
            } else {
                $modified = "import { formatInt } from '~/utils/format';`n`n" + $modified
            }
        }
    }

    return [PSCustomObject]@{
        Path = $fullPath
        RelativePath = Get-RelativePath $fullPath
        Original = $original
        Modified = $modified
        Changes = $changes
        TotalReplacements = $totalReplacements
        DateFlags = $dateFlags
        HasChanges = $totalReplacements -gt 0
    }
}

# ----- Preview -----

$results = @()
foreach ($file in $files) {
    $result = Invoke-FileProcessing $file.FullName
    if ($null -eq $result) { continue }
    if ($result.HasChanges -or $result.DateFlags.Count -gt 0) {
        $results += $result
    }
}

$totalReplacements = 0
$totalDateFlags = 0
foreach ($r in $results) {
    $totalReplacements += $r.TotalReplacements
    $totalDateFlags += $r.DateFlags.Count
}

foreach ($r in $results) {
    if (-not $r.HasChanges) { continue }
    $lineWord = if ($r.Changes.Count -eq 1) { 'line' } else { 'lines' }
    Write-Host "$($r.RelativePath) ($($r.TotalReplacements) replacements on $($r.Changes.Count) $lineWord)" -ForegroundColor Cyan
    $shown = 0
    foreach ($c in $r.Changes) {
        if ($shown -ge 3) {
            Write-Host "  ... $($r.Changes.Count - $shown) more" -ForegroundColor DarkGray
            break
        }
        Write-Host "  L$($c.LineNumber):  $($c.Original)" -ForegroundColor Gray
        Write-Host "    ->   $($c.Replacement)" -ForegroundColor Green
        $shown++
    }
    Write-Host ""
}

if ($totalDateFlags -gt 0) {
    Write-Host "DATE-FORMAT CALLS (manual review required - not replaced):" -ForegroundColor Yellow
    foreach ($r in $results) {
        foreach ($df in $r.DateFlags) {
            Write-Host "  $($r.RelativePath):$($df.LineNumber)  $($df.Line)" -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

$changedFileCount = ($results | Where-Object { $_.HasChanges }).Count

Write-Host "Summary:" -ForegroundColor White
Write-Host "  Files scanned:       $($files.Count)"
Write-Host "  Files with changes:  $changedFileCount"
Write-Host "  Total replacements:  $totalReplacements"
Write-Host "  Date calls flagged:  $totalDateFlags"
Write-Host ""

# ----- Apply -----

if (-not $Apply) {
    Write-Host "This was a preview. To apply these changes, re-run with:" -ForegroundColor White
    Write-Host "  .\scripts\codemod-tolocalestring.ps1 -Apply" -ForegroundColor Cyan
    exit 0
}

if ($changedFileCount -eq 0) {
    Write-Host "Nothing to apply." -ForegroundColor Yellow
    exit 0
}

# Git status check - refuse if affected files have uncommitted changes
$affectedRelPaths = @($results | Where-Object { $_.HasChanges } | ForEach-Object { $_.RelativePath })

try {
    $gitStatusAll = & git -C $Root status --porcelain 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dirty = @()
        foreach ($line in $gitStatusAll) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            # Format: "XY path/to/file" - path starts at column 3
            $path = $line.Substring(3).Trim()
            # Handle renames: "old -> new" - take the new path
            if ($path -like '* -> *') {
                $path = ($path -split ' -> ')[-1]
            }
            if ($affectedRelPaths -contains $path) {
                $dirty += $line
            }
        }
        if ($dirty.Count -gt 0) {
            Write-Host "[FAIL] Affected files have uncommitted changes:" -ForegroundColor Red
            $dirty | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
            Write-Host "Commit or stash them first, then re-run with -Apply." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[WARN] Could not run git status - proceeding without dirty-file check." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARN] Git not available - proceeding without dirty-file check." -ForegroundColor Yellow
}

Write-Host "Applying changes to $changedFileCount files..." -ForegroundColor White
Write-Host ""

$written = 0
foreach ($r in $results) {
    if (-not $r.HasChanges) { continue }
    [System.IO.File]::WriteAllText($r.Path, $r.Modified, $Utf8NoBom)
    Write-Host "  [OK] $($r.RelativePath)" -ForegroundColor Green
    $written++
}

Write-Host ""
Write-Host "[OK] Wrote $written files. Total replacements: $totalReplacements" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Review with:  git diff" -ForegroundColor Cyan
Write-Host "  2. If good:      git add . && git commit -m 'refactor: replace toLocaleString with formatInt for hydration safety'" -ForegroundColor Cyan
Write-Host "  3. If wrong:     git checkout ." -ForegroundColor Cyan
if ($totalDateFlags -gt 0) {
    Write-Host "  4. Manually fix the $totalDateFlags date-format call(s) flagged above." -ForegroundColor Yellow
}
Write-Host ""
