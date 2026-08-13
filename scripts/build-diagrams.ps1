# Renders every page of the draw.io master into the SVGs that GitHub displays.
#
# The .drawio file is the source; the .svg files beside it are generated and committed,
# because GitHub renders SVG in markdown but cannot render .drawio. Each SVG carries a
# copy of its diagram (-e), so it also reopens in draw.io if that is all you have.
#
#   pwsh scripts/build-diagrams.ps1

$ErrorActionPreference = 'Stop'

$exe = @(
  "$env:ProgramFiles\draw.io\draw.io.exe",
  "${env:ProgramFiles(x86)}\draw.io\draw.io.exe",
  "$env:LOCALAPPDATA\Programs\draw.io\draw.io.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
  throw "draw.io desktop not found. Install it from https://www.drawio.com/ (or 'winget install JGraph.Draw')."
}

$repo = Split-Path $PSScriptRoot -Parent
$src  = Join-Path $repo 'docs\diagrams\deal-room-architecture.drawio'

# Page index -> output file. Keep in step with the pages in the master.
$pages = @(
  @{ index = 1; out = 'docs\diagrams\how-it-fits-together.svg' },
  @{ index = 2; out = 'docs\diagrams\identity-trust-seam.svg' },
  @{ index = 3; out = 'docs\diagrams\azure-architecture.svg' },
  @{ index = 4; out = 'docs\diagrams\resource-interaction.svg' }
)

foreach ($p in $pages) {
  $out = Join-Path $repo $p.out
  Remove-Item $out -ErrorAction SilentlyContinue
  # Each page carries an explicit white background, so --theme light renders a light card
  # that stays readable on GitHub in dark mode as well as light. (--theme auto exports a
  # transparent background, which leaves the dark title text invisible on a dark page.)
  # --embed-svg-images inlines the official Azure icons so the SVG stands alone;
  # --embed-svg-fonts false keeps it ~40 KB instead of ~600 KB.
  $params = @(
    '--no-sandbox', '-x', '-p', $p.index, '-f', 'svg', '-e', '-b', '12',
    '--theme', 'light', '--embed-svg-fonts', 'false', '--embed-svg-images',
    '-o', "`"$out`"", "`"$src`""
  )
  $proc = Start-Process -FilePath $exe -ArgumentList $params -NoNewWindow -PassThru -Wait
  if ($proc.ExitCode -ne 0 -or -not (Test-Path $out)) {
    throw "Export failed for page $($p.index) -> $($p.out) (exit $($proc.ExitCode))"
  }
  '{0,-46} {1,8:N0} bytes' -f $p.out, (Get-Item $out).Length
}
