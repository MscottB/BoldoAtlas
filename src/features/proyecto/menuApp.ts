import { ref, type Component } from "vue";
import type { RouteLocationRaw, Router } from "vue-router";
import {
  Database,
  DatabaseBackup,
  Download,
  FilePlus,
  FileSpreadsheet,
  FolderOpen,
  House,
  RefreshCw,
  Settings,
  Sparkles,
} from "@lucide/vue";
import { RUTA_BIENVENIDA } from "@/app/estructura";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";
import { toast } from "vue-sonner";
import type { Organizacion } from "@/db/cliente";
import { buscarActualizaciones } from "@/features/actualizaciones/acciones";
import { alSoltarDatos } from "@/lib/baseActiva";
import { useOrganizaciones } from "@/stores/organizaciones";

/** Si el diálogo «Datos del proyecto» está abierto. Lo abren el nombre en la barra superior, el menú y la paleta. */
export const datosProyectoAbierto = ref(false);
alSoltarDatos(() => (datosProyectoAbierto.value = false)); // muestra la ruta de la base anterior

export interface EntradaMenu {
  /** Clave de i18n: `menu.<id>`. */
  id: string;
  icono: Component;
  /** Ruta a la que lleva; sin ella (ni `accion`), abre «Datos del proyecto». */
  destino?: RouteLocationRaw;
  /** Lo que hace en vez de navegar (p. ej. buscar actualizaciones). */
  accion?: () => unknown;
  /** Clave de i18n de la fase en que llega: la entrada aparece deshabilitada. */
  fase?: string;
}

/** Hace la acción de la entrada, lleva a su ruta o, si no tiene ninguna, abre «Datos del proyecto». */
export const irAEntrada = (e: EntradaMenu, router: Router) =>
  e.accion ? e.accion() : e.destino ? router.push(e.destino) : (datosProyectoAbierto.value = true);

/** «Abrir otra organización…»: las recientes, sin la abierta. */
export const entradasAbrirOtra = (
  recientes: Organizacion[],
  activa: string,
): { id: string; nombre: string }[] =>
  recientes.filter((o) => o.id !== activa).map(({ id, nombre }) => ({ id, nombre }));

/** «Comparar con…» en la paleta: toda la lista, sin la abierta. */
export const entradasComparar = (lista: Organizacion[], activa: string): { id: string; nombre: string }[] =>
  entradasAbrirOtra(lista, activa);

/** `de` es la abierta al pedirla: si al volver a la vista ya es otra, la comparación no vale y no se rehace sola. */
export const rutaComparar = (id: string, de: string): RouteLocationRaw => ({
  name: "comparar",
  query: { con: id, de },
});

export async function abrirOtra(id: string) {
  const r = await useOrganizaciones().abrir(id);
  if (!r.ok) toast.error(r.mensaje);
}

// «Nueva organización vacía» y «Explorar el ejemplo» se resuelven en Inicio (ahí se piden los nombres).
export const GRUPOS_MENU: EntradaMenu[][] = [
  [{ id: "inicio", icono: House, destino: RUTA_BIENVENIDA }],
  [
    { id: "vacia", icono: FilePlus, destino: { path: RUTA_BIENVENIDA, query: { accion: "vacia" } } },
    { id: "ejemplo", icono: Sparkles, destino: { path: RUTA_BIENVENIDA, query: { accion: "ejemplo" } } },
    {
      id: "boldo",
      icono: FolderOpen,
      destino: { path: "/importar-exportar", query: { accion: "importar" } },
    },
    {
      id: "exportar",
      icono: Download,
      destino: { path: "/importar-exportar", query: { accion: "exportar" } },
    },
    { id: "excel", icono: FileSpreadsheet, fase: "bienvenida.llegaFase4" },
  ].filter((e) => MOSTRAR_PROXIMAMENTE || !e.fase),
  [
    { id: "respaldos", icono: DatabaseBackup, destino: { path: "/configuracion", hash: "#cfg-respaldos" } },
    { id: "configuracion", icono: Settings, destino: "/configuracion" },
    { id: "datos", icono: Database },
    { id: "actualizar", icono: RefreshCw, accion: buscarActualizaciones },
  ],
];
