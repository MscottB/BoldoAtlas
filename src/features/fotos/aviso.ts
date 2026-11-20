// La app de escritorio ya no guarda fotos: el aviso que ofrece quitar las que quedaron (src-tauri/src/fotos.rs).
import { shallowRef } from "vue";
import { listen } from "@tauri-apps/api/event";
import {
  fotosHay,
  fotosPendientes,
  fotosQuitar,
  fotosQuitarTodas,
  type FotosPendientes as Pendientes,
} from "@/db/cliente";
import { esFallo } from "@/db/errores";
import { i18n } from "@/i18n";
import { alSoltarDatos, baseActual } from "@/lib/baseActiva";
import { nuevoId } from "@/lib/ids";
import { conTrabajo } from "@/lib/trabajos";

export type Traducir = typeof i18n.global.t;

interface Aviso {
  texto: string;
  /** Solo por la organización abierta: un archivo externo, que el arranque no mira. */
  externa: boolean;
  baseId: string;
}

/** Lo que se ve. */
export const aviso = shallowRef<Aviso | null>(null);
/** La limpieza en curso y su avance. */
export const quitando = shallowRef<{ hechos: number; total: number } | null>(null);

// «Más tarde» vale hasta cerrar la app: no se guarda, y el próximo arranque vuelve a avisar.
let yaAvisado = false;
const externasVistas = new Set<string>();
// El aviso general, si llegó con el de un externo a la vista o con una limpieza en curso: sale después.
let enEspera: Aviso | null = null;

let abierta = (): { nombre: string; externa: boolean } => ({ nombre: "", externa: false });
/** Lo registra el store de organizaciones: cómo se llama la abierta y si es un archivo externo. */
export const conocerAbierta = (f: typeof abierta): void => {
  abierta = f;
};

function mostrar(a: Aviso) {
  if (aviso.value || quitando.value) enEspera = a;
  else aviso.value = a;
}
function siguiente() {
  if (!enEspera || aviso.value || quitando.value) return;
  aviso.value = enEspera;
  enEspera = null;
}

// El aviso de un archivo externo es de esa organización: al cambiar de base ya no vale.
alSoltarDatos(() => {
  if (!aviso.value?.externa) return;
  aviso.value = null;
  siguiente();
});

export const debeAvisar = (p: Pendientes, yaAvisado: boolean): boolean =>
  !yaAvisado && (p.organizaciones.length > 0 || p.respaldos > 0);

/** «Norte», «Sur» y 5 respaldos. */
function dondeHay(lugares: string[], t: Traducir): string {
  if (lugares.length < 2) return lugares[0] ?? "";
  return `${lugares.slice(0, -1).join(", ")}${t("fotos.aviso.y")}${lugares[lugares.length - 1]}`;
}

export function textoAviso(p: Pendientes, t: Traducir): string {
  const lugares = p.organizaciones.map((nombre) => t("fotos.aviso.organizacion", { nombre }));
  if (p.respaldos) lugares.push(t("fotos.aviso.respaldos", p.respaldos));
  return t("fotos.aviso.texto", { donde: dondeHay(lugares, t) });
}

/** Al terminar la carga inicial. */
export async function revisarAlArrancar(): Promise<void> {
  if (yaAvisado) return;
  const p = await fotosPendientes();
  if (debeAvisar(p, yaAvisado)) {
    yaAvisado = true;
    mostrar({ texto: textoAviso(p, i18n.global.t), externa: false, baseId: baseActual() });
  } else {
    // sin nada en la lista, una foto en la abierta es de un archivo externo
    await revisarExterna(baseActual(), abierta().nombre);
  }
}

/** Al abrir un archivo externo: una vez por sesión. */
export async function revisarExterna(id: string, nombre: string): Promise<void> {
  if (quitando.value || aviso.value || externasVistas.has(id)) return;
  externasVistas.add(id);
  const hay = await fotosHay();
  if (!hay) return;
  const { t } = i18n.global;
  const nuevo: Aviso = {
    texto: t("fotos.aviso.texto", { donde: t("fotos.aviso.organizacion", { nombre }) }),
    externa: true,
    baseId: id,
  };
  // si el general o una limpieza ganaron la espera, `mostrar` lo deja en cola: no se pierde
  mostrar(nuevo);
}

export async function masTarde(): Promise<void> {
  const a = aviso.value;
  aviso.value = null;
  // lo que el aviso general dejó fuera: la abierta, si es un archivo externo (una propia sigue con sus fotos)
  const abiertaAhora = abierta();
  if (a && !a.externa && abiertaAhora.externa) await revisarExterna(baseActual(), abiertaAhora.nombre);
  siguiente();
}

async function quitarTodas(): Promise<{ quitadas: number; fallos: number }> {
  const soltar = await listen<{ hechos: number; total: number }>("fotos-avance", (e) => {
    quitando.value = e.payload;
  });
  try {
    return await fotosQuitarTodas(nuevoId());
  } finally {
    soltar();
  }
}

/**
 * «Quitar las fotos ahora»: el aviso se cierra y la limpieza sigue con su avance, sin bloquear la ventana. null si no
 * quitó nada; si no, cuántas y cuántos archivos fallaron (siguen pendientes para el próximo arranque).
 */
export async function quitarAhora(): Promise<{ quitadas: number; fallos: number } | null> {
  const a = aviso.value;
  aviso.value = null;
  // la de un archivo externo solo con esa base abierta: con otra, fotos_quitar limpiaría la que no es
  if (!a || quitando.value || (a.externa && a.baseId !== baseActual())) {
    siguiente();
    return null;
  }
  quitando.value = { hechos: 0, total: 0 };
  try {
    let r: { quitadas: number; fallos: number };
    try {
      r = await conTrabajo(i18n.global.t("trabajos.quitarFotos"), async () =>
        a.externa ? { quitadas: await fotosQuitar(), fallos: 0 } : quitarTodas(),
      );
    } catch (e) {
      // otro trabajo (una importación) ocupa la sesión: como «Más tarde», sin error; el próximo arranque vuelve a avisar
      if (esFallo(e) && e.codigo === "trabajo_en_curso") return null;
      throw e;
    } finally {
      quitando.value = null;
    }
    // La limpieza general no toca los archivos externos: si el abierto es uno, ahora se pregunta por él. Con una propia no
    // avisa: ya no tiene fotos (o falló, y entonces sí vale ofrecerlo de nuevo).
    if (!a.externa) await revisarExterna(baseActual(), abierta().nombre);
    return r;
  } finally {
    // también si la limpieza falla: un aviso general en espera no puede quedar oculto
    siguiente();
  }
}
