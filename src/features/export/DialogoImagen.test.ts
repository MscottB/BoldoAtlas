import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { u } from "@/features/arbol/fixture";
import { LIMITE_TARJETAS } from "@/features/arbol/rendimiento";
import { useOrganizacion } from "@/stores/organizacion";
import DialogoImagen from "./DialogoImagen.vue";

// Los diálogos de reka solo se abren en el navegador: aquí la ventana deja ver lo que lleva.
vi.mock("@/components/ui/dialog", async () => {
  const { h: hh } = await import("vue");
  const pasa = {
    setup:
      (_: unknown, { slots }: { slots: Slots }) =>
      () =>
        hh("div", slots.default?.()),
  };
  return {
    Dialog: pasa,
    DialogContent: pasa,
    DialogDescription: pasa,
    DialogFooter: pasa,
    DialogHeader: pasa,
    DialogTitle: pasa,
  };
});

const t = i18n.global.t;
let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

// Una raíz con `n` hijas: el lienzo empieza con dos niveles abiertos, así que se ven todas.
const conHijas = (n: number) =>
  useOrganizacion().$patch({
    unidades: [
      u("r", "t", "Gerencia General", null),
      ...Array.from({ length: n }, (_, i) => u(`h${i}`, "t", `Área ${i}`, "r", i)),
    ],
    cargado: true,
  });

async function html() {
  const app = createSSRApp({ render: () => h(DialogoImagen, { open: true }) });
  app.use(pinia).use(i18n);
  return renderToString(app);
}

describe("DialogoImagen", () => {
  it("muestra las opciones y los botones", async () => {
    conHijas(2);
    const s = await html();
    for (const n of ["estructura", "presentacion", "pantalla"]) {
      expect(s).toContain(`data-accion="nivel-${n}"`);
      expect(s).toContain(t(`imagen.niveles.${n}`));
    }
    for (const f of ["png", "jpg", "svg"]) expect(s).toContain(`data-accion="formato-${f}"`);
    expect(s).toContain(t("imagen.alcanceTodo"));
    expect(s).toContain(t("imagen.abrirTodo"));
    expect(s).toContain(t("imagen.vistaPrevia"));
    // PNG por defecto: con fondo y tamaño.
    expect(s).toContain(t("imagen.fondos.transparente"));
    expect(s).toContain("4x");
    expect(s).toContain('data-accion="guardar-imagen"');
    expect(s).toContain('data-accion="copiar-imagen"');
    expect(s).toContain(t("imagen.guardar"));
    expect(s).toContain(t("imagen.copiar"));
    expect(s).not.toContain("data-aviso-tarjetas");
  });

  it("avisa con la cifra cuando hay más de 1.000 tarjetas", async () => {
    conHijas(LIMITE_TARJETAS); // con la raíz, una más que el límite
    const s = await html();
    expect(s).toContain("data-aviso-tarjetas");
    const n = (LIMITE_TARJETAS + 1).toLocaleString("es");
    expect(s).toContain(t("imagen.muchas", { n, limite: LIMITE_TARJETAS.toLocaleString("es") }));
  });
});
