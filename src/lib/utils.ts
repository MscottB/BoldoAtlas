export { cn } from "cn"

/**
 * Los <select> nativos: el mismo alto, fondo, borde y foco que Input. En las barras y popovers del lienzo (y donde la fila
 * es de botones `sm`) se agrega h-7 con cn().
 */
export const claseSelect =
  "h-8 rounded-lg border border-campo-borde bg-card px-2 text-sm dark:bg-input/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
