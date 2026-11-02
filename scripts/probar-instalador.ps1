# Prueba el instalador de verdad: lo ejecuta, mira el título de su ventana y dónde quedan los accesos directos.
# Solo en CI: instala el programa y cambia accesos directos del usuario que lo corre.
param([Parameter(Mandatory)][string]$Instalador)

$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'Solo en CI: instala BoldoAtlas y cambia los accesos directos de este usuario.' }

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class VentanaInstalador {
  [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr v, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr v, uint msg, IntPtr largo, StringBuilder texto);
  // 1037: el título del encabezado en las páginas de NSIS. WM_GETTEXT porque la ventana es de otro proceso.
  public static string Titulo(IntPtr v) {
    var texto = new StringBuilder(256);
    SendMessage(GetDlgItem(v, 1037), 0x000D, (IntPtr)256, texto);
    return texto.ToString();
  }
}
'@

$programa = "$env:LOCALAPPDATA\BoldoAtlas\boldo-atlas.exe"
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'BoldoAtlas.lnk'
$escritorio = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BoldoAtlas.lnk'
$zonaPrivada = "$env:LOCALAPPDATA\Packages\OtraApp_abc\LocalCache\Local\BoldoAtlas\boldo-atlas.exe"
$portable = "$env:RUNNER_TEMP\portable\boldo-atlas.exe"
$shell = New-Object -ComObject WScript.Shell

function Ejecutar([string[]]$Argumentos, [string]$TituloEsperado) {
  $proceso = Start-Process $Instalador -ArgumentList $Argumentos -PassThru
  $titulos = @{}
  while (-not $proceso.HasExited) {
    $proceso.Refresh()
    if ($proceso.MainWindowHandle -ne 0) { $titulos[[VentanaInstalador]::Titulo($proceso.MainWindowHandle)] = $true }
    Start-Sleep -Milliseconds 10
  }
  $proceso.WaitForExit()
  if ($proceso.ExitCode -ne 0) { throw "El instalador $Argumentos terminó con el código $($proceso.ExitCode)" }
  $vistos = $titulos.Keys -join ' | '
  Write-Output "$Argumentos -> títulos: $vistos"
  if (-not $titulos.ContainsKey($TituloEsperado)) { throw "Se esperaba el título «$TituloEsperado» y se vio: $vistos" }
}

function Apuntar([string]$Lnk, [string]$Destino) {
  $acceso = $shell.CreateShortcut($Lnk)
  $acceso.TargetPath = $Destino
  $acceso.Save()
}

function Comprobar([string]$Lnk, [string]$Esperado) {
  $destino = $shell.CreateShortcut($Lnk).TargetPath
  if ($destino -ne $Esperado) { throw "$Lnk apunta a $destino y debía apuntar a $Esperado" }
}

foreach ($copia in $zonaPrivada, $portable) { New-Item -ItemType Directory -Force (Split-Path $copia) | Out-Null }

# Instalación nueva
Ejecutar '/P' 'Installing'
Comprobar $menu $programa
Comprobar $escritorio $programa
foreach ($copia in $zonaPrivada, $portable) { Copy-Item $programa $copia }

# Actualización, como la lanza la app: el acceso a la zona privada se mueve y el de la portable no se toca
Apuntar $menu $zonaPrivada
Apuntar $escritorio $portable
Ejecutar '/P', '/UPDATE' 'Updating'
Comprobar $menu $programa
Comprobar $escritorio $portable

# También el del escritorio
Apuntar $escritorio $zonaPrivada
Ejecutar '/P', '/UPDATE' 'Updating'
Comprobar $escritorio $programa

# Sin /UPDATE, sobre una copia ya instalada, como al abrir el instalador a mano
Ejecutar '/P' 'Updating'

Write-Output 'Instalador comprobado.'
