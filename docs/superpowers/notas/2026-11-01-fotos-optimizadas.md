# Fotos optimizadas y carga bajo demanda (Tasks 27a y 27b)

Medido el 2026-11-01 en Windows 11 con WebView2 156, en una build `prueba` aislada: portable en una carpeta temporal, con la organización grande de `scripts/sembrar-grande.mjs` (2.000 unidades, 10.000 personas). Las fotos son **retratos sintéticos** (cara, pelo de trazos finos, fondo desenfocado y ruido de sensor): sin fotos reales.

## Lado y calidad (27a)

Promedio de 4 retratos de 2000x2667 (2 MB en JPEG 92). SSIM y PSNR de luminancia contra el original llevado al tamaño en pantalla.

| Salida | Peso | 56 px en 2x | 56 px en 3x | 64 px en 2x (lienzo con zoom 2) |
|---|---|---|---|---|
| 128 JPEG 0,80 | 2,3 KB | 0,970 · 37,0 dB | 0,944 · 35,2 dB | 0,965 · 36,9 dB |
| 192 JPEG 0,85 | 4,1 KB | 0,984 · 41,3 dB | 0,966 · 38,8 dB | 0,981 · 41,0 dB |
| **256 JPEG 0,85** | **6,3 KB** | **0,986 · 42,7 dB** | **0,976 · 41,5 dB** | **0,985 · 42,9 dB** |
| 256 WebP 0,85 | 4,0 KB | 0,984 · 42,6 dB | 0,971 · 41,1 dB | 0,982 · 42,7 dB |
| 320 JPEG 0,85 | 9,3 KB | 0,986 · 40,8 dB | 0,980 · 42,7 dB | 0,985 · 42,8 dB |
| 512 JPEG 0,85 | 23,7 KB | 0,989 · 43,4 dB | 0,984 · 42,8 dB | 0,989 · 44,3 dB |

Aspecto, mirando un muestrario a tamaño real y ampliado 4 veces: 128 px se ve borroso en los ojos y el pelo, 192 px algo blando, y desde 256 px no se distingue del original.

**Decisión: lado de 256 px, JPEG 0,85.** La foto mayor en pantalla es de 56 px, y en el lienzo, 32 px con zoom 2; con pantallas de 3x hacen falta 168 px. WebP pesa un tercio menos, pero Safari y WebKitGTK no lo escriben desde un canvas (entregan PNG), y aquí la diferencia son 2 KB.

Límite de la prueba: un retrato sintético tiene menos textura que una foto real, que debería pesar más (se espera entre 15 y 30 KB). La proporción entre opciones sí sirve; el peso absoluto no. El umbral para volver a optimizar (48 KB en base64) deja margen para eso.

Orientación EXIF: un JPEG con orientación 6 dibujado desde un `<img>` en canvas sale girado bien (probado en WebView2), así que no hace falta corregirla. Falta comprobarlo en WebKit.

## Abrir la base (27b)

1.000 de las 10.000 personas con foto. Medido hasta ver los totales en Inicio; memoria de la app y sus procesos del WebView.

| | Abrir | Memoria (conjunto de trabajo) | Montón de JS | Respuesta de la lista | Tarda la lista |
|---|---|---|---|---|---|
| Antes, fotos de 300 KB | 6,1–11,7 s | 906–1.308 MB | 420 MB | 397 MB | 6,8 s |
| Antes, fotos de 1 MB | **se cierra sola a los 21 s** (0xE0000008) | | | | |
| Después, fotos de 300 KB | 0,8–0,9 s | 467–477 MB | 26 MB | 3,3 MB | 0,35–0,49 s |
| Después, fotos de 1 MB | 1,3–2,8 s | 457–482 MB | 26 MB | 3,3 MB | 1,1–2,0 s |
| Después, optimizadas | 0,6–0,7 s | 462–473 MB | 27 MB | 3,3 MB | 0,06 s |

La primera apertura de cada carpeta tarda más porque hace el respaldo automático y prepara el perfil del WebView.

Con fotos pesadas la lista aún tarda algo: `deleted_at` y `updated_at` van después de `foto_png` en la fila, y SQLite recorre las páginas de la foto para llegar a ellos. Optimizar lo resuelve, y un índice no se justifica.

Protocolo: 980 fotos de 300 KB pedidas de golpe se sirvieron en 0,8 s. En el lienzo inicial (13 tarjetas) se pidieron 12 fotos. Ver a una fecha carga en 0,4 s, con 3,6 MB.

Caché: con `immutable` y la versión en la URL, volver a pedir las mismas fotos no llega a Rust (60 fotos: de 80 ms a 1 ms), y tras 6 s no hay copia en la carpeta del WebView. Comprobado solo en WebView2.

## Optimizar fotos existentes

999 fotos de 300 KB, con 2 dañadas a propósito:

- Estimación con 8 fotos de muestra, en 0,5 s: «999 fotos ocupan 393 MB y quedarían en unos 8,3 MB».
- Todo el trabajo, en unos 25 s contando el respaldo y la interrupción de prueba: unas 50 fotos por segundo. En el tramo final (931 fotos) no hubo ninguna tarea larga de la ventana (más de 50 ms).
- La base bajó de 404 MB a 17,4 MB; el respaldo previo quedó en 402 MB, con las originales.
- Cancelar dejó lo ya hecho. Las 2 dañadas se nombraron y siguen como estaban.

## `updated_at`

Optimizar **no lo cambia**. Es la misma foto con menos peso: si contara como cambio, al fusionar, cada persona optimizada sería «lo más reciente» y su valor le ganaría de entrada a una edición real hecha en otra copia.

La contrapartida: al fusionar con una copia que aún tiene la foto original, esa foto aparece como diferencia con la misma fecha, sin preselección, y hay que elegir. Si la otra copia editó a esa persona después, gana su foto original, más pesada. No se pierde ningún dato, y se puede volver a optimizar.

Como la URL de la foto no cambia, quien ya la vio sigue viendo la copia en memoria hasta reiniciar: es la misma imagen.

## Presupuesto de `MAX_BYTES_VIVOS` (propuesta, sin aplicar)

512 MiB existían porque lo vivo se cargaba entero en la ventana. Hoy las 10.000 personas ocupan 3,3 MB y 26 MB de montón, aunque tengan 1.289 MiB de fotos, así que para fotos y notas ese tope ya no protege a la ventana.

Propuesta: no contar `trabajadores.foto_png` ni `trabajadores.notas` en el total. Quedan como freno su tope por campo (2 MiB y 256 KiB) y `MAX_ARCHIVO` (2 GiB). Los 512 MiB siguen valiendo para el resto.

No se aplica porque los números no lo exigen. Hay que ver antes cuánta memoria usa exportar e importar un archivo de 1,3 GB, y eso no se midió. Además, con fotos optimizadas 512 MiB alcanzan para unas 60.000 personas con foto. Hoy, una base con más de 512 MiB de fotos abre, pero no se puede exportar hasta optimizarla.

`CARGADAS_CON_ELIMINADAS` y los topes por campo siguen coherentes: catálogos y leyendas se cargan igual, y `SQL_HISTORICO` tampoco trae ya fotos ni notas.
