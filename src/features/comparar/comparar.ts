import { onScopeDispose, ref } from "vue";
import {
  comparacionCancelar,
  comparacionCerrar,
  comparacionDetalle,
  comparacionPagina,
  compararOrganizaciones,
  type DetalleComparado,
  type FiltroComparacion,
  type PaginaComparada,
  type Presencia,
  type ResumenComparacion,
} from "@/db/cliente";
import { intentar, intentarTrabajo } from "@/features/intercambio/intercambio";
import { i18n } from "@/i18n";
import { nuevoId } from "@/lib/ids";
import { deLaAbierta } from "@/lib/trabajos";
import type { Resultado } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";

export const POR_PAGINA = 50;

// Rust guarda una sola comparación: la siguiente espera a que se suelte la de la vista que se fue (al cambiar de pestaña
// una se desmonta y otra se monta), o ese cierre, si llega tarde, soltaría la nueva.
let soltando: Promise<unknown> = Promise.resolve();

/** «Solo en <una>» o «Difieren». */
export const textoPresencia = (p: Presencia, nombreAqui: string, nombreAlla: string): string =>
  p === "difieren"
    ? i18n.global.t("comparar.difieren")
    : i18n.global.t("comparar.soloEn", { nombre: p === "solo_aqui" ? nombreAqui : nombreAlla });

const CANCELADO: Resultado = { ok: false, codigo: "cancelado", mensaje: "" };

/**
 * Qué hacer con `?con=` y `?de=` de la ruta. `de` es la abierta cuando se pidió: si es otra, la comparación ya no vale.
 * Sin `de`, o con uno que no es un id (una ruta guardada antes de que existiera, o escrita a mano), no se sabe: se compara.
 */
export function decidir(
  con: string,
  de: unknown,
  abierta: string,
): "sin-con" | "misma" | "vencida" | "comparar" {
  if (!con) return "sin-con";
  if (con === abierta) return "misma";
  return typeof de === "string" && de && de !== abierta ? "vencida" : "comparar";
}

// Nadie espera el resultado de soltar o cancelar en Rust: que quede rastro si falla.
const avisarSiFalla = (que: string, r: { ok: true } | { ok: false; mensaje: string }) => {
  if (!r.ok) console.warn(`No se pudo ${que} la comparación:`, r.mensaje);
};

/** La comparación de la abierta con otra. Las acciones no lanzan; al salir de la vista se suelta en Rust. */
export function useComparar() {
  const { t } = i18n.global;
  const organizaciones = useOrganizaciones();
  const resumen = ref<ResumenComparacion | null>(null);
  const pagina = ref<PaginaComparada | null>(null);
  const detalle = ref<DetalleComparado | null>(null);
  const cargando = ref(false);
  const vencida = ref(false);
  /** El de la comparación en curso: su avance y su cancelación. */
  const trabajo = ref<string | null>(null);

  const fallo = (r: { codigo: string; mensaje: string }): Resultado => {
    if (r.codigo === "comparacion_vencida") vencida.value = true;
    return { ok: false, codigo: r.codigo, mensaje: r.mensaje };
  };

  // La vista ya se fue: nada de lo que siga esperando puede empezar en Rust, o quedaría una comparación sin soltar.
  let soltado = false;
  let pedidaPagina = 0;
  let pedidoDetalle = 0;

  /** `de`: la abierta cuando se pidió (`?de=` de la ruta). Si ya es otra, la comparación no vale y no se rehace sola. */
  async function comparar(otraId: string, de?: unknown): Promise<Resultado> {
    // lo que pidió la comparación anterior y llega tarde (también mientras se cancela) no debe marcar vencida la nueva
    pedidaPagina++;
    pedidoDetalle++;
    await cancelar();
    const decision = decidir(otraId, de, organizaciones.idAbierta);
    if (decision !== "comparar") {
      resumen.value = null;
      pagina.value = null;
      detalle.value = null;
      if (decision === "sin-con") return { ok: false, codigo: "sin_con", mensaje: t("comparar.elige") };
      vencida.value = true;
      return { ok: false, codigo: "comparacion_vencida", mensaje: t("respaldos.error.comparacion_vencida") };
    }
    await soltando;
    if (soltado) return CANCELADO;
    if (!organizaciones.listaAlDia) await organizaciones.cargarLista();
    if (soltado) return CANCELADO;
    if (!organizaciones.lista.some((o) => o.id === otraId))
      return { ok: false, codigo: "desconocido", mensaje: t("comparar.yaNoEsta") };
    const propio = nuevoId();
    trabajo.value = propio;
    cargando.value = true;
    vencida.value = false;
    resumen.value = null;
    pagina.value = null;
    detalle.value = null;
    const inicio = performance.now();
    const r = await intentarTrabajo(deLaAbierta(t("trabajos.comparar")), () =>
      compararOrganizaciones(otraId, propio),
    );
    if (trabajo.value !== propio) return CANCELADO; // se canceló: lo que llega tarde no cambia nada
    trabajo.value = null;
    cargando.value = false;
    if (!r.ok) return fallo(r);
    // la lee el arnés de organizaciones: solo una comparación que terminó
    performance.measure("comparar-organizaciones", { start: inicio });
    resumen.value = r.valor;
    return { ok: true };
  }

  async function cancelar(): Promise<Resultado> {
    const propio = trabajo.value;
    if (!propio) return { ok: true };
    trabajo.value = null;
    cargando.value = false;
    const r = await intentar(() => comparacionCancelar(propio));
    avisarSiFalla("cancelar", r);
    return r.ok ? { ok: true } : fallo(r);
  }

  async function verPagina(filtro: FiltroComparacion): Promise<Resultado> {
    const propia = ++pedidaPagina;
    const r = await intentar(() => comparacionPagina(filtro));
    if (propia !== pedidaPagina) return CANCELADO; // otra más nueva manda
    if (!r.ok) return fallo(r);
    pagina.value = r.valor;
    return { ok: true };
  }

  async function verDetalle(tabla: string, id: string): Promise<Resultado> {
    const propio = ++pedidoDetalle;
    detalle.value = null;
    const r = await intentar(() => comparacionDetalle(tabla, id));
    if (propio !== pedidoDetalle) return CANCELADO;
    if (!r.ok) return fallo(r);
    detalle.value = r.valor;
    return { ok: true };
  }

  /** Cancela lo que corre y suelta la comparación y su copia en Rust. */
  async function cerrar(): Promise<Resultado> {
    const hecho = cancelar().then(() => intentar(() => comparacionCerrar()));
    soltando = hecho;
    resumen.value = null;
    pagina.value = null;
    detalle.value = null;
    const r = await hecho;
    avisarSiFalla("soltar", r);
    return r.ok ? { ok: true } : fallo(r);
  }
  onScopeDispose(() => {
    soltado = true;
    void cerrar();
  });

  return {
    resumen,
    pagina,
    detalle,
    cargando,
    vencida,
    trabajo,
    comparar,
    cancelar,
    verPagina,
    verDetalle,
    cerrar,
  };
}
