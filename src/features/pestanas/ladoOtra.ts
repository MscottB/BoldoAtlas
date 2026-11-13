import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ladoAbrir, ladoCerrar } from "@/db/cliente";
import { mensajeOrganizacion } from "@/features/respaldos/respaldos";
import { useTema } from "@/features/tema/useTema";
import { i18n } from "@/i18n";
import { VISTAS_LADO } from "@/lado/modo";
import { useOrganizaciones } from "@/stores/organizaciones";
import { caben, type Memoria } from "./memoriaLado";
import { RUTA_INICIO } from "./pestanas";
import { irConFoco, routerDel } from "./routerConFoco";
import { ID_PANEL, usePestanas } from "./usePestanas";

/** Lo que el iframe de al lado le dice a la ventana (ver `src/lado/arranque.ts` y `useAtajos`). */
export type MensajeLado =
  | { tipo: "boldo-lado-ruta" | "boldo-lado-fuera"; ruta: string }
  | { tipo: "boldo-lado-tecla"; tecla: "F6" };

/**
 * Solo vale lo que manda el iframe de este panel (`ventana`), desde la app misma (`origen`), y con una forma conocida. Se
 * devuelve un objeto nuevo: nada del iframe queda en la ventana.
 */
export function filtrarMensaje(
  e: { source: unknown; origin: string; data: unknown },
  ventana: unknown,
  origen: string,
): MensajeLado | null {
  if (!ventana || e.source !== ventana || e.origin !== origen) return null;
  const d = e.data;
  if (typeof d !== "object" || d === null || !("tipo" in d)) return null;
  if ((d.tipo === "boldo-lado-ruta" || d.tipo === "boldo-lado-fuera") && "ruta" in d && typeof d.ruta === "string")
    return { tipo: d.tipo, ruta: d.ruta };
  if (d.tipo === "boldo-lado-tecla" && "tecla" in d && d.tecla === "F6") return { tipo: d.tipo, tecla: "F6" };
  return null;
}

/** La dirección del iframe: la app en modo lado con la otra, en la ruta de la pestaña si es una vista que se ve al lado. */
export const srcLado = (camino: string, org: string, ruta: string, nombre: unknown): string =>
  `${camino}?lado=${org}#${VISTAS_LADO.includes(String(nombre)) ? ruta : RUTA_INICIO}`;

/** El foco al panel principal, como F6 en él. */
function alPrincipal() {
  usePestanas().enfocarPanel("principal");
  document.getElementById(ID_PANEL.principal)?.focus();
}

/** La ruta a la que llegó el iframe queda en su pestaña; lo que no se ve al lado se abre en el principal; F6 vuelve a él. */
export function atenderMensaje(m: MensajeLado): void {
  if (m.tipo === "boldo-lado-ruta") return usePestanas().rutaDelLado(m.ruta, true);
  alPrincipal();
  if (m.tipo === "boldo-lado-fuera") void irConFoco(m.ruta);
}

const esCancelado = (e: unknown) =>
  typeof e === "object" && e !== null && "codigo" in e && e.codigo === "cancelado";

// Rust guarda una sola organización al lado: la copia siguiente espera a que se suelte la del panel que se fue, o ese
// cierre, si llega tarde, la soltaría (como `soltando` en comparar.ts).
let soltando: Promise<unknown> = Promise.resolve();

/**
 * El panel de al lado con la pestaña `id` de otra organización. Al montarse la copia en Rust (`ladoAbrir`) y, si cabe en
 * memoria o se acepta la pregunta, arma el iframe; al desmontarse la suelta. `ventana` es la del iframe, para sus mensajes.
 */
export function useLadoOtra(id: string, ventana: () => unknown) {
  const pestanas = usePestanas();
  const organizaciones = useOrganizaciones();
  const { tema, acento, escala } = useTema();
  // El panel se vuelve a montar si cambia su pestaña o su modo: la organización es fija.
  const org = pestanas.lista.find((p) => p.id === id)?.org ?? "";
  const nombre = computed(
    () => organizaciones.lista.find((o) => o.id === org)?.nombre || i18n.global.t("barra.sinNombre"),
  );
  const estado = ref<"copiando" | "preguntando" | "listo" | "error">("copiando");
  const error = ref("");
  const src = ref("");
  // Decisión 12: con otro tema, idioma o escala, el iframe se vuelve a montar (key) en la ruta de ahora.
  const clave = computed(() => [tema.value, acento.value, escala.value, i18n.global.locale.value].join(" "));

  function armar() {
    const p = pestanas.lista.find((x) => x.id === id);
    // De Configuración, Ayuda o Acerca de, que no van al lado, la vista a la que vuelven.
    const ruta = p ? pestanas.rutaDeTrabajo(p) : RUTA_INICIO;
    src.value = srcLado(location.pathname, org, ruta, routerDel("principal").resolve(ruta).name);
  }
  watch(clave, () => src.value && armar());

  function abrirIgual() {
    estado.value = "listo";
    armar();
  }
  /** El diálogo de memoria se cerró: sin haber elegido «Abrir igual», es un «No». */
  function alCerrarPregunta() {
    if (estado.value === "preguntando") pestanas.cerrarDivision();
  }

  const alMensaje = (e: MessageEvent) => {
    const m = filtrarMensaje(e, ventana(), location.origin);
    if (m) atenderMensaje(m);
  };
  let vivo = true;
  onMounted(async () => {
    window.addEventListener("message", alMensaje);
    await soltando;
    if (!vivo) return;
    try {
      const info = await ladoAbrir(org);
      if (!vivo) return;
      if (caben(info, (performance as { memory?: Memoria }).memory)) abrirIgual();
      else estado.value = "preguntando";
    } catch (e) {
      // Reemplazada por otro pedido o un cierre: ya hay otro panel, o ninguno.
      if (!vivo || esCancelado(e)) return;
      error.value = mensajeOrganizacion(e);
      estado.value = "error";
    }
  });
  onBeforeUnmount(() => {
    vivo = false;
    window.removeEventListener("message", alMensaje);
    // Nadie espera que se suelte: que quede rastro si falla.
    soltando = ladoCerrar().catch((e: unknown) =>
      console.warn("No se pudo soltar la organización de al lado:", e),
    );
  });

  return { nombre, estado, error, src, clave, abrirIgual, alCerrarPregunta };
}
