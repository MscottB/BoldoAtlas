import type { Router } from "vue-router";
import { VISTAS_LADO } from "./modo";

// Lo que se dicen la ventana y el iframe del panel de al lado. Mismo origen: nada sale de la app. Cada lado solo acepta
// lo que viene de la otra ventana, desde la app misma, y con una forma conocida; se copia en un objeto nuevo.

/** Las teclas que el iframe le pasa a la ventana: F6 y los atajos de pestañas y de la paleta, que son de ella. */
export const TECLAS_LADO = [
  "F6",
  "nuevaPestana",
  "cerrarPestana",
  "pestanaSiguiente",
  "pestanaAnterior",
  "paleta",
] as const;
export type TeclaLado = (typeof TECLAS_LADO)[number];

/** Del iframe a la ventana. */
export type MensajeLado =
  | { tipo: "boldo-lado-ruta" | "boldo-lado-fuera"; ruta: string }
  | { tipo: "boldo-lado-tecla"; tecla: TeclaLado }
  | { tipo: "boldo-lado-foco" };

/** De la ventana al iframe: navegar ahí (el menú lateral o la paleta, con el foco al lado). */
export interface MensajePadre {
  tipo: "boldo-lado-ir";
  ruta: string;
}

interface Evento {
  source: unknown;
  origin: string;
  data: unknown;
}

const datos = (e: Evento, de: unknown, origen: string): Record<string, unknown> | null =>
  de && e.source === de && e.origin === origen && typeof e.data === "object" && e.data !== null
    ? (e.data as Record<string, unknown>)
    : null;

/** En la ventana: lo que manda el iframe de este panel (`ventana`). */
export function filtrarMensaje(e: Evento, ventana: unknown, origen: string): MensajeLado | null {
  const d = datos(e, ventana, origen);
  if (!d) return null;
  if ((d.tipo === "boldo-lado-ruta" || d.tipo === "boldo-lado-fuera") && typeof d.ruta === "string")
    return { tipo: d.tipo, ruta: d.ruta };
  if (d.tipo === "boldo-lado-tecla" && TECLAS_LADO.includes(d.tecla as TeclaLado))
    return { tipo: d.tipo, tecla: d.tecla as TeclaLado };
  if (d.tipo === "boldo-lado-foco") return { tipo: d.tipo };
  return null;
}

/** En el iframe: lo que manda la ventana que lo contiene (`padre`). */
export function filtrarDelPadre(e: Evento, padre: unknown, origen: string): MensajePadre | null {
  const d = datos(e, padre, origen);
  return d?.tipo === "boldo-lado-ir" && typeof d.ruta === "string" ? { tipo: d.tipo, ruta: d.ruta } : null;
}

/**
 * La ventana no ve el foco ni los clics dentro del iframe: el iframe le avisa al entrar en él, una vez hasta que lo
 * pierde (`salir`).
 */
export function avisoDeFoco(enviar: () => void) {
  let avisado = false;
  return {
    entrar: () => {
      if (avisado) return;
      avisado = true;
      enviar();
    },
    salir: () => {
      avisado = false;
    },
  };
}

/** Mismo origen que el padre: el mensaje no sale de la app. */
export const alPadre = (mensaje: MensajeLado) => window.parent.postMessage(mensaje, location.origin);

/** En el iframe: navega a lo que pide la ventana, si es una vista que se ve al lado, y le avisa cuando recibe el foco. */
export function escucharPadre(r: Router): void {
  window.addEventListener("message", (e) => {
    const m = filtrarDelPadre(e, window.parent, location.origin);
    if (m && VISTAS_LADO.includes(String(r.resolve(m.ruta).name))) void r.push(m.ruta);
  });
  const aviso = avisoDeFoco(() => alPadre({ tipo: "boldo-lado-foco" }));
  document.addEventListener("focusin", aviso.entrar);
  document.addEventListener("pointerdown", aviso.entrar, true);
  window.addEventListener("blur", aviso.salir);
}
