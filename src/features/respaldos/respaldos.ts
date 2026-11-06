import { toast } from "vue-sonner";
import { listarRespaldos, respaldarAhora, type AvanceEliminar, type FalloRespaldo } from "@/db/cliente";
import { i18n } from "@/i18n";
import { BaseCambiada } from "@/lib/baseActiva";
import { leerPreferencia } from "@/lib/preferencias";
import { conTrabajo, deLaAbierta, trabajos } from "@/lib/trabajos";
import { FRECUENCIA_POR_DEFECTO, tocaRespaldar, ultimoRespaldo } from "./programa";

export const PREFERENCIA = "respaldos";
// Bastante menor que el plazo más corto (un día): la hora exacta da lo mismo.
const REVISION = 900_000;
const ESPERA_TRAS_FALLO = 86_400_000;

/** Traduce el código de error que devuelve Rust; lo inesperado muestra el detalle técnico. */
export function mensajeFallo(e: unknown): string {
  if (e instanceof BaseCambiada) return ""; // se pasó a otra organización: no falló nada, y `toast.error("")` no muestra nada
  const { t, te } = i18n.global;
  const f: Partial<FalloRespaldo> = typeof e === "object" && e !== null ? e : { detalle: String(e) };
  const clave = `respaldos.error.${f.codigo}`;
  // contenido_invalido dice en `detalle` qué se encontró; los que no tienen texto propio usan el general
  const precisa = f.codigo === "contenido_invalido" ? `${clave}_${f.detalle}` : clave;
  return t(te(precisa) ? precisa : te(clave) ? clave : "respaldos.error.fallo", { detalle: f.detalle ?? "" });
}

/** Dónde está lo que se pasó de un tope, como lo dice Rust en `muy_pesado`. */
interface Donde {
  tabla: string;
  columna: string;
  nombre: string | null;
}

export const dondeDe = (e: unknown): Donde | null =>
  typeof e === "object" && e !== null && "donde" in e ? (e.donde as Donde | null) : null;

/** Qué se excedió del total en `muy_pesado_total` («filas» o «bytes»), ya en palabras. */
export function excesoDe(e: unknown): string {
  const { t, te } = i18n.global;
  const detalle = typeof e === "object" && e !== null && "detalle" in e ? String(e.detalle) : "";
  return te(`intercambio.exceso.${detalle}`) ? t(`intercambio.exceso.${detalle}`) : "";
}

/** Dónde está lo que se pasó de un tope, con etiquetas legibles. Una tabla o columna desconocida no se muestra tal cual. */
export function mensajeTope(d: Donde): string {
  const { t, te } = i18n.global;
  const tabla = `intercambio.tablas.${d.tabla}`;
  const columna = `intercambio.columnas.${d.columna}`;
  const datos = {
    tabla: te(tabla) ? t(tabla) : t("intercambio.columnas.otra"),
    columna: te(columna) ? t(columna) : t("intercambio.columnas.otra"),
    nombre: d.nombre ?? "",
  };
  return t(d.nombre ? "intercambio.error.muy_pesado_fila" : "intercambio.error.muy_pesado", datos);
}

/** Lo mismo al abrir una organización: lo que `respaldos.error` dice pensando en un respaldo tiene aquí su texto. */
export function mensajeOrganizacion(e: unknown): string {
  const { t, te } = i18n.global;
  const donde = dondeDe(e);
  if (donde) return mensajeTope(donde);
  const codigo = typeof e === "object" && e !== null && "codigo" in e ? e.codigo : "";
  const clave = `organizaciones.error.${String(codigo)}`;
  return te(clave) ? t(clave, { exceso: excesoDe(e) }) : mensajeFallo(e);
}

/** Una acción sobre organizaciones que falló, con el código de Rust para quien deba distinguirlo. */
export function falloOrganizacion(e: unknown): {
  ok: false;
  mensaje: string;
  codigo: string;
  detalle: string;
  avance?: AvanceEliminar;
} {
  const f: Partial<FalloRespaldo> = typeof e === "object" && e !== null ? e : {};
  return {
    ok: false,
    mensaje: mensajeOrganizacion(e),
    codigo: f.codigo ?? "",
    detalle: f.detalle ?? "",
    avance: f.avance,
  };
}

/** «Respaldar ahora» y el automático: cuenta como trabajo en curso. */
export const respaldar = (): Promise<string> =>
  conTrabajo(deLaAbierta(i18n.global.t("trabajos.respaldar")), respaldarAhora);

let noAntesDe = 0;
/** El respaldo automático que corre: lo empezó la app, no quien pide un cambio de organización, que lo espera. */
let automatico: Promise<unknown> | null = null;

/** Lo que falta del respaldo automático si es el único trabajo en curso; si hay otro, null. */
export const soloRespaldoAutomatico = (): Promise<unknown> | null =>
  automatico && trabajos.value.length === 1 ? automatico.catch(() => undefined) : null;

/**
 * Respalda en segundo plano si toca. Si falla, un aviso discreto y un día sin reintentar: con la ventana oculta, un fallo
 * la trae al frente, y no debe hacerlo en cada revisión.
 */
export async function respaldoAutomatico(alAbrir = true): Promise<void> {
  const aviso = deLaAbierta(i18n.global.t("respaldos.automaticoFallo"));
  try {
    const frecuencia = leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO);
    if (tocaRespaldar(frecuencia, ultimoRespaldo(await listarRespaldos()), new Date(), alAbrir)) {
      const este = respaldar();
      automatico = este;
      try {
        await este;
      } finally {
        if (automatico === este) automatico = null;
      }
    }
  } catch (e) {
    if (e instanceof BaseCambiada) return; // se pasó a otra organización: no falló nada
    noAntesDe = Date.now() + ESPERA_TRAS_FALLO;
    // Sin caducar: con la ventana oculta nadie lo ve antes de volver a ella.
    toast(aviso, {
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
