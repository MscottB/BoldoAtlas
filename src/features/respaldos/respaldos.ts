import { toast } from "vue-sonner";
import { listarRespaldos, respaldarAhora, type FalloRespaldo } from "@/db/cliente";
import { i18n } from "@/i18n";
import { leerPreferencia } from "@/lib/preferencias";
import type { Resultado } from "@/stores/organizacion";
import { FRECUENCIA_POR_DEFECTO, tocaRespaldar, ultimoRespaldo } from "./programa";

export const PREFERENCIA = "respaldos";

/** Traduce el código de error que devuelve Rust; lo inesperado muestra el detalle técnico. */
export function mensajeFallo(e: unknown): string {
  const { t, te } = i18n.global;
  const f: Partial<FalloRespaldo> = typeof e === "object" && e !== null ? e : { detalle: String(e) };
  const clave = `respaldos.error.${f.codigo}`;
  return t(te(clave) ? clave : "respaldos.error.fallo", { detalle: f.detalle ?? "" });
}

/** Al iniciar, ya cargados los datos: respalda en segundo plano si toca. Si falla, solo un aviso discreto. */
export async function respaldoAutomatico(): Promise<void> {
  try {
    const frecuencia = leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO);
    if (tocaRespaldar(frecuencia, ultimoRespaldo(await listarRespaldos()), new Date()))
      await respaldarAhora();
  } catch (e) {
    toast(i18n.global.t("respaldos.automaticoFallo"), { description: mensajeFallo(e) });
  }
}

/** Hace un respaldo y solo si sale bien ejecuta `accion` (que reemplaza datos): sin respaldo no se reemplaza nada. */
export async function conRespaldoPrevio(
  respaldar: () => Promise<unknown>,
  accion: () => Promise<Resultado>,
): Promise<Resultado> {
  try {
    await respaldar();
  } catch (e) {
    return { ok: false, mensaje: mensajeFallo(e) };
  }
  return accion();
}
