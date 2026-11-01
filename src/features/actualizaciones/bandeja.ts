import { watch } from "vue";
import type { Router } from "vue-router";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { RUTA_BIENVENIDA } from "@/app/estructura";
import { pedirSalir, traerAlFrente } from "@/app/ventana";
import { paletaAbierta } from "@/features/atajos/useAtajos";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { i18n } from "@/i18n";
import { useActualizaciones } from "@/stores/actualizaciones";
import { useOrganizacion } from "@/stores/organizacion";
import { buscarActualizaciones } from "./acciones";

/**
 * Icono en la bandeja del sistema mientras la app está abierta (spec §12), instalada y portable. Menú: Abrir, Inicio,
 * Buscar persona, «Actualizar a vX» (si hay versión nueva) o «Buscar actualizaciones», Configuración y Salir. No deja
 * la app en segundo plano: cerrar la ventana la cierra (y con ella el icono), y «Salir» cierra la ventana por el mismo
 * camino: pregunta si la opción está activa y termina en el cierre ordenado de SQLite (RunEvent::Exit).
 * Con una versión nueva, el texto del icono (tooltip) también lo avisa.
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
  // La paleta no existe en Inicio: con datos se vuelve a la vista activa; sin datos no hay a quién buscar y sigue en Inicio.
  const buscarPersona = async () => {
    if (router.currentRoute.value.meta.sinMarco) {
      if (org.vacia) return;
      await pestanas.volverAlProyecto();
    }
    paletaAbierta.value = true;
  };
  // en el idioma de la interfaz; la entrada del actualizador cambia si hay versión nueva
  const textos = () => ({
    abrir: t("bandeja.abrir"),
    inicio: t("menu.inicio"),
    buscar: t("bandeja.buscarPersona"),
    actualizar: a.disponible
      ? t("bandeja.actualizarA", { version: a.disponible.version })
      : t("actualizar.buscar"),
    configuracion: t("nav.configuracion"),
    salir: t("bandeja.salir"),
  });
  const x = textos();
  try {
    if (!(await invoke<boolean>("bandeja_disponible"))) return;
    const abrir = await MenuItem.new({ id: "abrir", text: x.abrir, action: () => void traerAlFrente() });
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
    const salir = await MenuItem.new({ id: "salir", text: x.salir, action: () => void pedirSalir() });
    const menu = await Menu.new({
      items: [
        abrir,
        await PredefinedMenuItem.new({ item: "Separator" }),
        inicio,
        buscar,
        actualizar,
        configuracion,
        await PredefinedMenuItem.new({ item: "Separator" }),
        salir,
      ],
    });
    const tooltip = () => (a.disponible ? t("actualizar.disponible", { version: a.disponible.version }) : "BoldoAtlas");
    const icono = await TrayIcon.new({
      id: "principal",
      icon: (await defaultWindowIcon()) ?? undefined,
      tooltip: tooltip(),
      menu,
      showMenuOnLeftClick: false,
      // clic izquierdo: trae la ventana; el menú va con el derecho
      action: (e) => {
        if (e.type === "Click" && e.button === "Left" && e.buttonState === "Up") void traerAlFrente();
      },
    });
    watch(textos, (n) => {
      void abrir.setText(n.abrir);
      void inicio.setText(n.inicio);
      void buscar.setText(n.buscar);
      void actualizar.setText(n.actualizar);
      void configuracion.setText(n.configuracion);
      void salir.setText(n.salir);
      void icono.setTooltip(tooltip());
    });
  } catch {
    // sin bandeja: el resto de la app no depende de ella
  }
}
