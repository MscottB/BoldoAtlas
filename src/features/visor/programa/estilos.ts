/** El CSS del visor HTML, con la paleta clara de treeSvg (el archivo no sigue el tema de la app). */
export const ESTILOS = `
*{box-sizing:border-box}
body{margin:0;background:#ffffff;color:#0a0a0a;font-family:Inter,"Segoe UI",Arial,sans-serif}
main[data-visor="dibujo"]{overflow:auto;padding:16px}
main[data-visor="dibujo"] svg{display:block;max-width:none}
[data-id],[data-plegar]{cursor:pointer}
[data-id]:focus-visible,[data-plegar]:focus-visible{outline:2px solid #a3a3a3;outline-offset:2px}
noscript{display:block;padding:16px;color:#737373}
`;
