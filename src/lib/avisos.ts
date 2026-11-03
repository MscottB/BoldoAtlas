import { toast } from "vue-sonner";

/**
 * Una acción cuya respuesta llegó de una base que ya no está devuelve `mensaje: ""` (`BaseCambiada`), y quien la pidió hace
 * `toast.error(r.mensaje)` sin mirar: no hay nada que avisar. Una sola vez, al arrancar.
 */
export function callarAvisosVacios(): void {
  for (const tipo of ["error", "warning"] as const) {
    const mostrar = toast[tipo];
    toast[tipo] = (mensaje, opciones) => (mensaje === "" ? "" : mostrar(mensaje, opciones));
  }
}
