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
import { i18n } from "@/i18n";
import { alSoltarDatos, baseActual } from "@/lib/baseActiva";
import { nuevoId } from "@/lib/ids";
import { conTrabajo } from "@/lib/trabajos";

export type Traducir = typeof i18n.global.t;

/** Lo que se ve. `externa`: solo por la organización abierta, un archivo externo que el arranque no mira. */
export const aviso = shallowRef<{ texto: string; externa: boolean; baseId: string } | null>(null);
/** La limpieza en curso y su avance. */
export const quitando = shallowRef<{ hechos: number; total: number } | null>(null);

// «Más tarde» vale hasta cerrar la app: no se guarda, y el próximo arranque vuelve a avisar.
let yaAvisado = false;
const externasVistas = new Set<string>();
// El aviso de un archivo externo es de esa organización: al cambiar de base ya no vale.
alSoltarDatos(() => {
  if (aviso.value?.externa) aviso.value = null;
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

/** Al terminar la carga inicial. `nombreAbierta`: por si la abierta es un archivo externo con fotos. */
export async function revisarAlArrancar(nombreAbierta: string): Promise<void> {
  if (quitando.value || aviso.value) return;
  const p = await fotosPendientes();
  if (quitando.value || aviso.value) return; // mientras se leía, otro aviso o una limpieza
  if (debeAvisar(p, yaAvisado)) {
    yaAvisado = true;
    aviso.value = { texto: textoAviso(p, i18n.global.t), externa: false, baseId: baseActual() };
  } else if (!debeAvisar(p, false)) await revisarExterna(baseActual(), nombreAbierta);
}

/** Al abrir un archivo externo: una vez por sesión. */
export async function revisarExterna(id: string, nombre: string): Promise<void> {
  if (quitando.value || aviso.value || externasVistas.has(id)) return;
  externasVistas.add(id);
  if (!(await fotosHay())) return;
  const { t } = i18n.global;
  aviso.value = {
    texto: t("fotos.aviso.texto", { donde: t("fotos.aviso.organizacion", { nombre }) }),
    externa: true,
    baseId: id,
  };
}

export function masTarde(): void {
  aviso.value = null;
}

async function quitarTodas(): Promise<number> {
  const soltar = await listen<{ hechos: number; total: number }>("fotos-avance", (e) => {
    quitando.value = e.payload;
  });
  try {
    return await fotosQuitarTodas(nuevoId());
  } finally {
    soltar();
  }
}

/** «Quitar las fotos ahora»: el aviso se cierra y la limpieza sigue con su avance, sin bloquear la ventana. Falso si no
 * quitó nada. */
export async function quitarAhora(): Promise<boolean> {
  const a = aviso.value;
  aviso.value = null;
  // la de un archivo externo solo con esa base abierta: con otra, fotos_quitar limpiaría la que no es
  if (!a || quitando.value || (a.externa && a.baseId !== baseActual())) return false;
  quitando.value = { hechos: 0, total: 0 };
  try {
    await conTrabajo(i18n.global.t("trabajos.quitarFotos"), () =>
      a.externa ? fotosQuitar() : quitarTodas(),
    );
  } finally {
    quitando.value = null;
  }
  return true;
}
