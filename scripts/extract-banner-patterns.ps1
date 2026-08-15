# Extract Minecraft banner pattern masks → src/schema/bannerPatterns.data.js
#
# Reads the banner pattern textures from a local Minecraft version jar and writes their per-pixel
# ALPHA (0–255, row-major, 20×40 front face at texture offset 1,1) as base64 into a generated data
# module. Alpha is the whole mask: it carries the shape AND Minecraft's own edge anti-aliasing, so
# the renderer needs no synthetic feather. RGB is discarded (the pattern is white, dyed at runtime).
#
# Dev-only, Windows-only (uses GDI+ to decode PNG, no npm dependency). Re-run to refresh from a
# newer version:  powershell -File scripts/extract-banner-patterns.ps1 -Version 1.21
param([string]$Version = '1.21')

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$jar = "$env:APPDATA\.minecraft\versions\$Version\$Version.jar"
if (-not (Test-Path $jar)) { throw "Jar not found: $jar" }
$outPath = Join-Path $PSScriptRoot '..\src\schema\bannerPatterns.data.js'

$OX = 1; $OY = 1; $W = 20; $H = 40   # front-face window inside the 64×64 texture

$zip = [System.IO.Compression.ZipFile]::OpenRead($jar)
try {
  $rows = @()
  $entries = $zip.Entries |
    Where-Object { $_.FullName -match 'entity/banner/([a-z_]+)\.png$' -and $_.FullName -notmatch '/base\.png$' } |
    Sort-Object FullName
  foreach ($e in $entries) {
    $id = [System.IO.Path]::GetFileNameWithoutExtension($e.FullName)
    $s = $e.Open(); $ms = New-Object System.IO.MemoryStream; $s.CopyTo($ms); $ms.Position = 0
    $bmp = New-Object System.Drawing.Bitmap($ms)
    $bytes = New-Object 'System.Collections.Generic.List[byte]'
    for ($y = 0; $y -lt $H; $y++) {
      for ($x = 0; $x -lt $W; $x++) { $bytes.Add([byte]$bmp.GetPixel($OX + $x, $OY + $y).A) }
    }
    $b64 = [Convert]::ToBase64String($bytes.ToArray())
    $rows += "  $id`: '$b64',"
    $bmp.Dispose(); $ms.Dispose(); $s.Dispose()
  }
  $header = @"
/**
 * Codex — Banner pattern alpha masks (GENERATED — do not edit by hand).
 *
 * Regenerate:  powershell -File scripts/extract-banner-patterns.ps1 -Version $Version
 *
 * Each value is base64 of the pattern's per-pixel ALPHA (0–255), row-major over the 20×40 banner
 * front face, extracted from Minecraft $Version's `entity/banner/*.png` textures. Alpha is the mask:
 * it encodes the shape and Minecraft's own edge anti-aliasing. Keyed by the game's pattern id.
 */
export const BANNER_PATTERN_ALPHA = {
"@
  $js = $header + "`n" + ($rows -join "`n") + "`n};`n"
  [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath (Split-Path $outPath)).Path + '\' + (Split-Path $outPath -Leaf), $js, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output "Wrote $($entries.Count) patterns → $outPath"
} finally { $zip.Dispose() }