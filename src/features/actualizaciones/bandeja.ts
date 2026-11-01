import { ref, watch } from "vue";
import type { Router } from "vue-router";
import { toast } from "vue-sonner";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RUTA_BIENVENIDA } from "@/app/estructura";
import { bandejaLista, traerAlFrente } from "@/app/ventana";
import { abrirCarpetaDatos, respaldarAhora } from "@/db/cliente";
import { paletaAbierta } from "@/features/atajos/useAtajos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { i18n } from "@/i18n";
import { trabajos } from "@/lib/trabajos";
import { useActualizaciones } from "@/stores/actualizaciones";
import { useOrganizacion } from "@/stores/organizacion";
import { buscarActualizaciones } from "./acciones";

/**
 * Icono en la bandeja del sistema mientras la app está abierta (spec §12), instalada y portable. Menú: Abrir, Inicio,
 * Buscar persona, Configuración, Ayuda, «Actualizar a vX» (si hay versión nueva) o «Buscar actualizaciones», Respaldar
 * ahora, Abrir carpeta de datos y Salir. Con la ventana oculta (`dejarEnBandeja`) es el camino de vuelta, junto con
 * abrir de nuevo el acceso directo. El clic, «Abrir» y «Salir» los atiende Rust (`salida.rs`), para que sirvan también
 * con la interfaz colgada; «Salir» nunca deja la app en la bandeja y termina en el cierre ordenado de SQLite.
 * Con una versión nueva, el texto del icono (tooltip) también lo avisa, y lo mismo un trabajo que termina con la ventana
 * oculta. shortcut: ese aviso solo se ve al pasar el mouse sobre el icono; si no basta, una notificación del sistema,
 * que pide un plugin más.
 * En Linux, crear el icono sin libayatana-appindicator3 haría entrar en pánico a tray-icon y, con panic = "abort",
 * cerraría la app (un try/catch no lo ataja): por eso Rust prueba antes la biblioteca (`bandeja_disponible`) y,
 * si no está, no hay icono y la app funciona igual.
 */
export async function crearBandeja(router: Router): Promise<void> {
  const { t } = i18n.global;
  const a = useActualizaciones();
  const org = useOrganizacion();
  const pestanas = usePestanas();
  const tras = (accion: () => unknown) => async () => {
    await traerAlFrente();
    await accion();
  };
  // La paleta no existe en Inicio: con datos se vuelve a la vista activa; sin datos no hay a quién buscar y se avisa.
  const buscarPersona = async () => {
    if (router.currentRoute.value.meta.sinMarco) {
      if (org.vacia) return void toast.info(t("bandeja.sinPersonas"));
      await pestanas.volverAlProyecto();
    }
    paletaAbierta.value = true;
  };
  // El último trabajo que terminó con la ventana oculta: se olvida al volver a la ventana.
  const terminado = ref("");
  const tooltip = () => {
    if (terminado.value) return t("bandeja.trabajoTerminado", { trabajo: terminado.value });
    return a.disponible ? t("actualizar.disponible", { version: a.disponible.version }) : "BoldoAtlas";
  };
  // en el idioma de la interfaz; la entrada del actualizador cambia si hay versión nueva
  const textos = () => ({
    tooltip: tooltip(),
    abrir: t("bandeja.abrir"),
    inicio: t("menu.inicio"),
    buscar: t("bandeja.buscarPersona"),
    actualizar: a.disponible
      ? t("bandeja.actualizarA", { version: a.disponible.version })
      : t("actualizar.buscar"),
    configuracion: t("nav.configuracion"),
    ayuda: t("nav.ayuda"),
    respaldar: t("respaldos.ahora"),
    carpeta: t("bandeja.carpeta"),
    salir: t("bandeja.salir"),
  });
  const x = textos();
  try {
    if (!(await invoke<boolean>("bandeja_disponible"))) return;
    const abrir = await MenuItem.new({ id: "abrir", text: x.abrir });
    const inicio = await MenuItem.new({
      id: "inicio",
      text: x.inicio,
      action: tras(() => router.push(RUTA_BIENVENIDA)),
    });
    const buscar = await MenuItem.new({ id: "buscar", text: x.buscar, action: tras(buscarPersona) });
    const actualizar = await MenuItem.new({
      id: "actualizar",
      text: x.actualizar,
      action: tras(() => (a.disponible ? (a.ventanaAbierta = true) : buscarActualizaciones())),
    });
    const configuracion = await MenuItem.new({
      id: "configuracion",
      text: x.configuracion,
      action: tras(() => router.push("/configuracion")),
    });
    const ayuda = await MenuItem.new({
      id: "ayuda",
      text: x.ayuda,
      action: tras(() => router.push("/ayuda")),
    });
    const respaldar = await MenuItem.new({
      id: "respaldar",
      text: x.respaldar,
      action: () =>
        respaldarAhora().then(
          () => toast.success(t("respaldos.hecho")),
          (e: unknown) => toast.error(mensajeFallo(e)),
        ),
    });
    const carpeta = await MenuItem.new({
      id: "carpeta",
      text: x.carpeta,
      action: () => abrirCarpetaDatos().catch((e: unknown) => toast.error(mensajeFallo(e))),
    });
    const salir = await MenuItem.new({ id: "salir", text: x.salir });
    const menu = await Menu.new({
      items: [
        abrir,
        await PredefinedMenuItem.new({ item: "Separator" }),
        inicio,
        buscar,
        configuracion,
        ayuda,
        await PredefinedMenuItem.new({ item: "Separator" }),
        actualizar,
        respaldar,
        carpeta,
        await PredefinedMenuItem.new({ item: "Separator" }),
        salir,
      ],
    });
    const icono = await TrayIcon.new({
      id: "principal",
      icon: (await defaultWindowIcon()) ?? undefined,
      tooltip: x.tooltip,
      menu,
      // clic izquierdo: trae la ventana; el menú va con el derecho
      showMenuOnLeftClick: false,
    });
    bandejaLista.value = true;
    watch(textos, (n) => {
      void abrir.setText(n.abrir);
      void inicio.setText(n.inicio);
      void buscar.setText(n.buscar);
      void actualizar.setText(n.actualizar);
      void configuracion.setText(n.configuracion);
      void ayuda.setText(n.ayuda);
      void respaldar.setText(n.respaldar);
      void carpeta.setText(n.carpeta);
      void salir.setText(n.salir);
      void icono.setTooltip(n.tooltip);
    });
    const ventana = getCurrentWindow();
    watch(
      () => [...trabajos.value],
      async (ahora, antes) => {
        const fin = antes.find((n) => !ahora.includes(n));
        if (fin && !(await ventana.isVisible())) terminado.value = fin;
      },
    );
    await ventana.onFocusChanged((e) => {
      if (e.payload) terminado.value = "";
    });
  } catch {
    // sin bandeja: el resto de la app no depende de ella
  }
}
