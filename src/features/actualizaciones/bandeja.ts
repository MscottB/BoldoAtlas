import { watch } from "vue";
import type { Router } from "vue-router";
import { toast } from "vue-sonner";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { abrirCarpetaDatos, respaldarAhora } from "@/db/cliente";
import { i18n } from "@/i18n";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { useActualizaciones } from "@/stores/actualizaciones";
import { buscarActualizaciones } from "./acciones";

/**
 * Icono en la bandeja del sistema mientras la app está abierta (spec §12), instalada y portable. Menú: Abrir,
 * «Actualizar a vX» (si hay versión nueva) o «Buscar actualizaciones», Respaldar ahora, Abrir carpeta de datos,
 * Ayuda y Salir. No deja la app en segundo plano: cerrar la ventana la cierra (y con ella el icono), y «Salir»
 * cierra la ventana por el mismo camino, que termina en el cierre ordenado de SQLite (RunEvent::Exit).
 * Sin bandeja (p. ej. un Linux sin AppIndicator) la app funciona igual.
 */
export async function crearBandeja(router: Router): Promise<void> {
  const { t } = i18n.global;
  const a = useActualizaciones();
  const ventana = getCurrentWindow();
  const mostrar = async () => {
    await ventana.unminimize();
    await ventana.show();
    await ventana.setFocus();
  };
  const tras = (accion: () => unknown) => async () => {
    await mostrar();
    await accion();
  };
  // en el idioma de la interfaz; la entrada del actualizador cambia si hay versión nueva
  const textos = () => ({
    abrir: t("bandeja.abrir"),
    actualizar: a.disponible
      ? t("bandeja.actualizarA", { version: a.disponible.version })
      : t("actualizar.buscar"),
    respaldar: t("respaldos.ahora"),
    carpeta: t("bandeja.carpeta"),
    ayuda: t("nav.ayuda"),
    salir: t("bandeja.salir"),
  });
  const x = textos();
  try {
    const abrir = await MenuItem.new({ id: "abrir", text: x.abrir, action: () => void mostrar() });
    const actualizar = await MenuItem.new({
      id: "actualizar",
      text: x.actualizar,
      action: tras(() => (a.disponible ? (a.ventanaAbierta = true) : buscarActualizaciones())),
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
    const ayuda = await MenuItem.new({
      id: "ayuda",
      text: x.ayuda,
      action: tras(() => router.push("/ayuda")),
    });
    const salir = await MenuItem.new({ id: "salir", text: x.salir, action: () => void ventana.close() });
    const menu = await Menu.new({
      items: [
        abrir,
        actualizar,
        await PredefinedMenuItem.new({ item: "Separator" }),
        respaldar,
        carpeta,
        ayuda,
        await PredefinedMenuItem.new({ item: "Separator" }),
        salir,
      ],
    });
    await TrayIcon.new({
      id: "principal",
      icon: (await defaultWindowIcon()) ?? undefined,
      tooltip: "BoldoAtlas",
      menu,
      showMenuOnLeftClick: false,
      // clic izquierdo: trae la ventana; el menú va con el derecho
      action: (e) => {
        if (e.type === "Click" && e.button === "Left" && e.buttonState === "Up") void mostrar();
      },
    });
    watch(textos, (n) => {
      void abrir.setText(n.abrir);
      void actualizar.setText(n.actualizar);
      void respaldar.setText(n.respaldar);
      void carpeta.setText(n.carpeta);
      void ayuda.setText(n.ayuda);
      void salir.setText(n.salir);
    });
  } catch {
    // sin bandeja: el resto de la app no depende de ella
  }
}
