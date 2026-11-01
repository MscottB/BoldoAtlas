# Regenera desde assets/brand/icono.png las imágenes de marca de los instaladores y el icono de la app.
#   pwsh scripts/marca-instalador.ps1          (Windows: usa System.Drawing)
# Después de cambiar el logo: `npx tauri icon assets/brand/icono-app.png -o src-tauri/icons` y volver a ejecutar
# esto, porque `tauri icon` no incluye 20 y 40 px en icon.ico y escribe los tamaños chicos como PNG.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path $PSScriptRoot -Parent
$logo = [Drawing.Image]::FromFile("$raiz\assets\brand\icono.png")
$marca = [Drawing.ColorTranslator]::FromHtml("#c8743f")   # --marca de src/styles/main.css
$sobreMarca = [Drawing.ColorTranslator]::FromHtml("#111827") # --marca-foreground: 5,09:1 sobre --marca
$tinta = [Drawing.ColorTranslator]::FromHtml("#192936")   # el azul del logo
$instalador = "$raiz\src-tauri\instalador"

function Lienzo($ancho, $alto, $formato) {
  $b = New-Object Drawing.Bitmap $ancho, $alto, $formato
  $g = [Drawing.Graphics]::FromImage($b)
  $g.SmoothingMode = "AntiAlias"
  $g.InterpolationMode = "HighQualityBicubic"
  $g.PixelOffsetMode = "HighQuality"
  $g.TextRenderingHint = "AntiAliasGridFit"
  @($b, $g)
}

# Baldosa blanca redondeada con el logo: el azul del logo no se ve sobre una barra de tareas o un menú oscuros.
function Baldosa($g, $x, $y, $lado) {
  $r = $lado * 0.22
  $d = $r * 2
  $camino = New-Object Drawing.Drawing2D.GraphicsPath
  $camino.AddArc($x, $y, $d, $d, 180, 90)
  $camino.AddArc($x + $lado - $d, $y, $d, $d, 270, 90)
  $camino.AddArc($x + $lado - $d, $y + $lado - $d, $d, $d, 0, 90)
  $camino.AddArc($x, $y + $lado - $d, $d, $d, 90, 90)
  $camino.CloseFigure()
  $g.FillPath([Drawing.Brushes]::White, $camino)
  $m = $lado * 0.08
  $g.DrawImage($logo, [single]($x + $m), [single]($y + $m), [single]($lado - 2 * $m), [single]($lado - 2 * $m))
}

function Icono($lado) {
  $b, $g = Lienzo $lado $lado ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  Baldosa $g 0 0 $lado
  $g.Dispose()
  $b
}

function Bmp24($b, $ruta) { $b.Save($ruta, [Drawing.Imaging.ImageFormat]::Bmp); $b.Dispose() }

# Icono de la app, fuente de `tauri icon`
$fuente = Icono 1024
$fuente.Save("$raiz\assets\brand\icono-app.png", [Drawing.Imaging.ImageFormat]::Png)
$fuente.Dispose()

# icon.ico: Tauri usa la imagen más grande para la ventana y la bandeja, y Windows la escala. Hasta 64 px en BMP (el
# formato que entienden todas las rutas del shell) y 256 en PNG.
$tamanos = 32, 16, 20, 24, 40, 48, 64, 256
$imagenes = foreach ($t in $tamanos) {
  $b = Icono $t
  $ms = New-Object IO.MemoryStream
  if ($t -eq 256) {
    $b.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  } else {
    $w = New-Object IO.BinaryWriter $ms
    $w.Write([uint32]40); $w.Write([int32]$t); $w.Write([int32]($t * 2)); $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]0); $w.Write([uint32]0); $w.Write([int32]0); $w.Write([int32]0); $w.Write([uint32]0); $w.Write([uint32]0)
    for ($y = $t - 1; $y -ge 0; $y--) { for ($x = 0; $x -lt $t; $x++) { $c = $b.GetPixel($x, $y); $w.Write([byte]$c.B); $w.Write([byte]$c.G); $w.Write([byte]$c.R); $w.Write([byte]$c.A) } }
    # máscara AND: 1 bit por píxel, filas alineadas a 4 bytes; a cero porque manda el alfa
    $w.Write([byte[]]::new([math]::Ceiling($t / 32) * 4 * $t))
  }
  $b.Dispose()
  , @($t, $ms.ToArray())
}
$ico = [IO.File]::Create("$raiz\src-tauri\icons\icon.ico")
$w = New-Object IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$imagenes.Count)
$pos = 6 + 16 * $imagenes.Count
foreach ($i in $imagenes) {
  $t = $i[0] % 256
  $w.Write([byte]$t); $w.Write([byte]$t); $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$i[1].Length); $w.Write([uint32]$pos)
  $pos += $i[1].Length
}
foreach ($i in $imagenes) { $w.Write($i[1]) }
$w.Dispose()

# Encabezado NSIS (150x57) y lateral NSIS (164x314): BMP de 24 bits, sin alfa
# El nombre como en logo-horizontal: «Boldo» grueso y «Atlas» fino. $x nulo: centrado en $ancho.
function Nombre($g, $x, $y, $tam, $color, $ancho = 0) {
  $grueso = New-Object Drawing.Font "Segoe UI", $tam, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel)
  $fino = New-Object Drawing.Font "Segoe UI", $tam, ([Drawing.FontStyle]::Regular), ([Drawing.GraphicsUnit]::Pixel)
  $f = [Drawing.StringFormat]::GenericTypographic
  $a = $g.MeasureString("Boldo", $grueso, 400, $f).Width
  $b = $g.MeasureString("Atlas", $fino, 400, $f).Width
  if ($ancho) { $x = ($ancho - $a - $b) / 2 }
  $pincel = New-Object Drawing.SolidBrush $color
  $g.DrawString("Boldo", $grueso, $pincel, [single]$x, [single]$y, $f)
  $g.DrawString("Atlas", $fino, $pincel, [single]($x + $a), [single]$y, $f)
}
$b, $g = Lienzo 150 57 ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g.Clear([Drawing.Color]::White)
$g.DrawImage($logo, 8, 12, 33, 33)
Nombre $g 45 18 19 $tinta
$g.FillRectangle((New-Object Drawing.SolidBrush $marca), 0, 54, 150, 3)
$g.Dispose()
Bmp24 $b "$instalador\encabezado.bmp"

$b, $g = Lienzo 164 314 ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g.Clear($marca)
Baldosa $g 34 72 96
Nombre $g 0 182 24 $sobreMarca 164

$g.Dispose()
Bmp24 $b "$instalador\lateral.bmp"

# Fondo del .dmg de macOS (660x400, el tamaño de bundle.macOS.dmg.windowSize): el icono de la app y la carpeta
# Aplicaciones quedan sobre el círculo y la flecha los une
$b, $g = Lienzo 660 400 ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g.Clear([Drawing.Color]::White)
$g.FillRectangle((New-Object Drawing.SolidBrush $marca), 0, 0, 660, 8)
$g.DrawImage($logo, 24, 26, 40, 40)
Nombre $g 70 32 24 $tinta
$lapiz = New-Object Drawing.Pen $marca, 5
$lapiz.CustomEndCap = New-Object Drawing.Drawing2D.AdjustableArrowCap 5, 5
$g.DrawLine($lapiz, 270, 200, 390, 200)
$g.Dispose()
$b.Save("$instalador\fondo-dmg.png", [Drawing.Imaging.ImageFormat]::Png)
$b.Dispose()
$logo.Dispose()
