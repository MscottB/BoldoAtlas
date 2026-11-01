import { openUrl } from "@tauri-apps/plugin-opener";

/** La URL de un enlace si es externa (http, https o mailto); si no, null. */
export function urlExterna(href: string | null | undefined): string | null {
  return href && /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null;
}

/** Abre en el navegador del sistema solo una URL externa; cualquier otra cosa no hace nada. */
export function abrirExterna(href: string | null | undefined): void {
  const url = urlExterna(href);
  if (url) openUrl(url).catch(() => {});
}

/**
 * Para `@click` en un bloque de Markdown renderizado (notas de versión, Ayuda): ningún enlace navega dentro del
 * WebView, que dejaría la app en otra página; los externos se abren en el navegador del sistema.
 */
export function abrirEnlacesFuera(e: MouseEvent): void {
  const enlace = (e.target as Element | null)?.closest?.("a[href]");
  if (!enlace) return;
  e.preventDefault();
  abrirExterna(enlace.getAttribute("href"));
}
