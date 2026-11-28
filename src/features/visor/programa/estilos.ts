/** Los colores del visor (paleta clara de treeSvg). Sus pares de texto y fondo se miden con `contraste()` en estado.test.ts. */
export const COLORES = {
  fondo: "#ffffff",
  barra: "#f5f5f5",
  texto: "#0a0a0a",
  apagado: "#525252",
  borde: "#737373",
  acento: "#1d4ed8",
  sobreAcento: "#ffffff",
  seleccion: "#dbeafe",
};

const c = COLORES;

/** El CSS del visor HTML, con la paleta clara de treeSvg (el archivo no sigue el tema de la app). */
export const ESTILOS = `
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%}
body{margin:0;display:flex;flex-direction:column;background:${c.fondo};color:${c.texto};font:14px/1.4 Inter,"Segoe UI",Arial,sans-serif}
button,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid ${c.acento};outline-offset:2px}
header[data-visor="barra"]{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:8px 16px;background:${c.barra};border-bottom:1px solid ${c.borde}}
[data-visor="logo"]{height:32px;max-width:96px;object-fit:contain}
[data-visor="titulos"]{display:flex;flex-direction:column;min-width:0}
[data-visor="organizacion"]{font-weight:700}
[data-visor="alcance"],[data-visor="generado"]{color:${c.apagado};font-size:12px}
[data-visor="buscador"]{position:relative;flex:1 1 220px;max-width:360px}
[data-visor="buscar"]{width:100%;padding:6px 8px;background:${c.fondo};border:1px solid ${c.borde};border-radius:6px}
[data-visor="resultados"]{position:absolute;z-index:5;left:0;right:0;top:100%;margin:2px 0 0;padding:4px;list-style:none;max-height:320px;overflow:auto;background:${c.fondo};border:1px solid ${c.borde};border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.2)}
[data-visor="resultados"] [role="option"]{display:flex;flex-direction:column;padding:6px 8px;border-radius:4px;cursor:pointer}
[data-visor="resultados"] [role="option"][aria-selected="true"]{background:${c.seleccion}}
[data-visor="resultados"] [aria-disabled="true"]{color:${c.apagado};cursor:default}
[data-visor="detalle"]{color:${c.apagado};font-size:12px}
[data-visor="zoom"],[data-visor="vista"]{display:flex;gap:4px}
header button{min-width:32px;padding:5px 10px;background:${c.fondo};border:1px solid ${c.borde};border-radius:6px;cursor:pointer}
header button[aria-pressed="true"]{background:${c.acento};border-color:${c.acento};color:${c.sobreAcento}}
main[data-visor="dibujo"]{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;cursor:grab}
main[data-visor="dibujo"].arrastrando{cursor:grabbing}
main[data-visor="dibujo"] svg{display:block;width:100%;height:100%;user-select:none}
[data-id],[data-plegar]{cursor:pointer}
[data-id].resaltada{filter:drop-shadow(0 0 3px ${c.acento}) drop-shadow(0 0 3px ${c.acento})}
[data-visor="estado"]{position:fixed;z-index:6;top:72px;left:50%;transform:translateX(-50%);padding:4px 12px;background:${c.texto};color:${c.fondo};border-radius:999px}
[data-visor="estado"]:empty{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%)}
[role="alert"]{margin:16px;padding:12px;border:1px solid ${c.texto};border-radius:6px}
[data-visor="lista"]{flex:1;min-height:0;overflow:auto;padding:8px 16px}
[data-visor="lista"] [role="treeitem"]{display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:4px;cursor:pointer}
[data-visor="lista"] [role="treeitem"]:hover{background:${c.barra}}
[data-visor="lista"] [role="treeitem"].resaltada{background:${c.seleccion}}
[data-visor="rama"]{display:inline-block;width:1em;color:${c.apagado};text-align:center}
aside[data-visor="panel"]{position:fixed;z-index:10;top:0;right:0;bottom:0;width:min(380px,100%);overflow:auto;padding:16px;background:${c.fondo};border-left:1px solid ${c.borde};box-shadow:-4px 0 12px rgba(0,0,0,.15)}
aside[data-visor="panel"] h2{margin:0 32px 4px 0;font-size:18px}
aside[data-visor="panel"] h3{margin:16px 0 4px;font-size:13px;color:${c.apagado};text-transform:uppercase}
aside[data-visor="panel"] ul{margin:0;padding:0;list-style:none}
aside[data-visor="panel"] li{padding:6px 0;border-bottom:1px solid ${c.barra}}
[data-visor="panel-cerrar"]{position:absolute;top:12px;right:12px;padding:2px 8px;background:${c.fondo};border:1px solid ${c.borde};border-radius:6px;cursor:pointer}
[data-visor="ruta"],[data-visor="reemplazo"]{color:${c.apagado};font-size:12px}
[data-visor="cargo"]{font-weight:600}
[data-visor="vacante"]{color:${c.apagado};font-style:italic}
aside[data-visor="panel"] a{display:block;color:${c.acento}}
noscript{display:block;padding:16px;color:${c.apagado}}
`;
