/**
 * Para un diálogo: recuerda quién tenía el foco al abrirse y, al cerrarse, si ese elemento ya no existe (p. ej. la
 * paleta, que se cierra al elegir, o el diálogo de un puesto) deja el foco en el botón de buscar en vez de perderlo
 * en <body>. Se usa con @open-auto-focus y @close-auto-focus del contenido del diálogo.
 */
export function useRetornoFoco() {
  let previo: Element | null = null;
  return {
    alAbrir: () => {
      previo = document.activeElement;
    },
    alCerrar: (e: Event) => {
      if (previo?.isConnected && previo !== document.body) return;
      e.preventDefault();
      document.querySelector<HTMLElement>("[data-buscar-paleta]")?.focus();
    },
  };
}
