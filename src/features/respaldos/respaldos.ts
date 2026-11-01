import { toast } from "vue-sonner";
import { listarRespaldos, respaldarAhora, type FalloRespaldo } from "@/db/cliente";
import { i18n } from "@/i18n";
import { leerPreferencia } from "@/lib/preferencias";
import { conTrabajo, trabajos } from "@/lib/trabajos";
import type { Resultado } from "@/stores/organizacion";
import { FRECUENCIA_POR_DEFECTO, tocaRespaldar, ultimoRespaldo } from "./programa";

export const PREFERENCIA = "respaldos";
// Bastante menor que el plazo más corto (un día): la hora exacta da lo mismo.
const REVISION = 900_000;
const ESPERA_TRAS_FALLO = 86_400_000;

/** Traduce el código de error que devuelve Rust; lo inesperado muestra el detalle técnico. */
export function mensajeFallo(e: unknown): string {
  const { t, te } = i18n.global;
  const f: Partial<FalloRespaldo> = typeof e === "object" && e !== null ? e : { detalle: String(e) };
  const clave = `respaldos.error.${f.codigo}`;
  return t(te(clave) ? clave : "respaldos.error.fallo", { detalle: f.detalle ?? "" });
}

/** «Respaldar ahora» y el automático: cuenta como trabajo en curso. */
export const respaldar = (): Promise<string> =>
  conTrabajo(i18n.global.t("trabajos.respaldar"), respaldarAhora);

let noAntesDe = 0;

/**
 * Respalda en segundo plano si toca. Si falla, un aviso discreto y un día sin reintentar: con la ventana oculta, un fallo
 * la trae al frente, y no debe hacerlo en cada revisión.
 */
export async function respaldoAutomatico(alAbrir = true): Promise<void> {
  try {
    const frecuencia = leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO);
    if (tocaRespaldar(frecuencia, ultimoRespaldo(await listarRespaldos()), new Date(), alAbrir)) await respaldar();
  } catch (e) {
    noAntesDe = Date.now() + ESPERA_TRAS_FALLO;
    // Sin caducar: con la ventana oculta nadie lo ve antes de volver a ella.
    toast(i18n.global.t("respaldos.automaticoFallo"), {
      description: mensajeFallo(e),
      duration: Infinity,
    });
  }
}

let temporizador: ReturnType<typeof setInterval> | undefined;

/** Al iniciar, ya cargados los datos. La app puede pasar días abierta, en la bandeja: se revisa también mientras sigue abierta. */
export function iniciarRespaldoAutomatico(): void {
  if (temporizador) return;
  void respaldoAutomatico();
  temporizador = setInterval(() => {
    if (!trabajos.value.length && Date.now() >= noAntesDe) void respaldoAutomatico(false);
  }, REVISION);
}

/** Hace un respaldo y solo si sale bien ejecuta `accion` (que reemplaza datos): sin respaldo no se reemplaza nada. */
export async function conRespaldoPrevio(
  hacerRespaldo: () => Promise<unknown>,
  accion: () => Promise<Resultado>,
): Promise<Resultado> {
  try {
    await conTrabajo(i18n.global.t("trabajos.respaldar"), hacerRespaldo);
  } catch (e) {
    return { ok: false, mensaje: mensajeFallo(e) };
  }
  return accion();
}
