import { ref, type Component } from "vue";
import type { RouteLocationRaw, Router } from "vue-router";
import {
  Database,
  DatabaseBackup,
  FilePlus,
  FileSpreadsheet,
  FolderOpen,
  House,
  Settings,
  Sparkles,
} from "@lucide/vue";
import { RUTA_BIENVENIDA } from "@/app/estructura";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";

/** Si el diálogo «Datos del proyecto» está abierto. Lo abren el nombre en la barra superior, el menú y la paleta. */
export const datosProyectoAbierto = ref(false);

export interface EntradaMenu {
  /** Clave de i18n: `menu.<id>`. */
  id: string;
  icono: Component;
  /** Ruta a la que lleva; sin ella, abre «Datos del proyecto». */
  destino?: RouteLocationRaw;
  /** Clave de i18n de la fase en que llega: la entrada aparece deshabilitada. */
  fase?: string;
}

/** Lleva a la ruta de la entrada o, si no tiene, abre «Datos del proyecto». */
export const irAEntrada = (e: EntradaMenu, router: Router) =>
  e.destino ? router.push(e.destino) : (datosProyectoAbierto.value = true);

// «Nueva organización vacía» y «Explorar el ejemplo» se resuelven en la Bienvenida (ahí está la confirmación).
export const GRUPOS_MENU: EntradaMenu[][] = [
  [{ id: "inicio", icono: House, destino: RUTA_BIENVENIDA }],
  [
    { id: "vacia", icono: FilePlus, destino: { path: RUTA_BIENVENIDA, query: { accion: "vacia" } } },
    { id: "ejemplo", icono: Sparkles, destino: { path: RUTA_BIENVENIDA, query: { accion: "ejemplo" } } },
    { id: "boldo", icono: FolderOpen, fase: "bienvenida.llegaFase5" },
    { id: "excel", icono: FileSpreadsheet, fase: "bienvenida.llegaFase4" },
  ].filter((e) => MOSTRAR_PROXIMAMENTE || !e.fase),
  [
    { id: "respaldos", icono: DatabaseBackup, destino: { path: "/configuracion", hash: "#cfg-respaldos" } },
    { id: "configuracion", icono: Settings, destino: "/configuracion" },
    { id: "datos", icono: Database },
  ],
];
