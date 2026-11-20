import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { u } from "@/features/arbol/fixture";
import { LIMITE_TARJETAS } from "@/features/arbol/rendimiento";
import { useOrganizacion } from "@/stores/organizacion";
import DialogoImagen from "./DialogoImagen.vue";
import { LIMITE_PAGINAS, avisosPdf } from "./paginasDeAlcance";

// Lo elegido la última vez (en node no hay localStorage).
const pref = vi.hoisted(() => ({ valor: {} as Record<string, unknown> }));
vi.mock("@/lib/preferencias", async (original) => ({
  ...(await original<object>()),
  leerPreferencia: () => pref.valor,
  guardarPreferencia: () => {},
}));

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
  pref.valor = {};
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

  it("sin PDF elegido no muestra sus opciones", async () => {
    conHijas(2);
    const s = await html();
    expect(s).toContain('data-accion="formato-pdf"');
    expect(s).not.toContain('data-accion="hoja-');
  });

  it("con PDF: hoja, orientación y reparto, por defecto carta, horizontal y por ramas; sin copiar", async () => {
    pref.valor = { formato: "pdf" };
    conHijas(2);
    const s = await html();
    const marcada = (accion: string) => new RegExp(`<input[^>]*data-accion="${accion}"[^>]*>`).exec(s)?.[0];
    for (const h of ["carta", "oficio", "a4", "a3", "a2"]) {
      expect(marcada(`hoja-${h}`)).toBeDefined();
      expect(s).toContain(t(`pdf.hojas.${h}`));
    }
    for (const o of ["horizontal", "vertical"]) expect(s).toContain(t(`pdf.orientaciones.${o}`));
    for (const r of ["una", "ramas", "cuadricula"]) expect(s).toContain(t(`pdf.repartos.${r}`));
    expect(marcada("hoja-carta")).toContain("checked");
    expect(marcada("hoja-a4")).not.toContain("checked");
    expect(marcada("orientacion-horizontal")).toContain("checked");
    expect(marcada("orientacion-vertical")).not.toContain("checked");
    expect(marcada("reparto-ramas")).toContain("checked");
    expect(marcada("reparto-una")).not.toContain("checked");
    expect(marcada("reparto-cuadricula")).toBeDefined();
    expect(marcada("formato-pdf")).toContain("checked");
    // Ni copiar, ni fondo, ni tamaño: no son de un PDF. Guardar sí.
    expect(s).not.toContain('data-accion="copiar-imagen"');
    expect(s).not.toContain(t("imagen.fondos.transparente"));
    expect(s).not.toContain("4x");
    expect(s).toContain('data-accion="guardar-imagen"');
  });

  it("recuerda la hoja, la orientación y el reparto elegidos", async () => {
    pref.valor = { formato: "pdf", hoja: "a3", orientacion: "vertical", reparto: "cuadricula" };
    conHijas(2);
    const s = await html();
    const marcada = (accion: string) => new RegExp(`<input[^>]*data-accion="${accion}"[^>]*>`).exec(s)?.[0];
    expect(marcada("hoja-a3")).toContain("checked");
    expect(marcada("orientacion-vertical")).toContain("checked");
    expect(marcada("reparto-cuadricula")).toContain("checked");
  });

  it("avisa si en una página no se lee, y sobre 200 páginas con la cifra", () => {
    expect(avisosPdf("ramas", { ilegible: false, total: 3 }, "es")).toEqual([]);
    expect(avisosPdf("una", { ilegible: false, total: 1 }, "es")).toEqual([]);
    expect(avisosPdf("una", { ilegible: true, total: 1 }, "es")).toEqual([t("pdf.ilegible")]);
    // En los otros repartos también se avisa, sin sugerir repartir (ya se reparte).
    for (const reparto of ["ramas", "cuadricula"] as const)
      expect(avisosPdf(reparto, { ilegible: true, total: 3 }, "es")).toEqual([t("pdf.ilegibleAlguna")]);
    expect(avisosPdf("cuadricula", { ilegible: false, total: LIMITE_PAGINAS }, "es")).toEqual([]);
    const muchas = avisosPdf("ramas", { ilegible: false, total: 1234 }, "es");
    expect(muchas).toEqual([t("pdf.muchas", { n: (1234).toLocaleString("es"), limite: LIMITE_PAGINAS })]);
    expect(muchas[0]).toContain((1234).toLocaleString("es"));
  });

  it("el pie que recibe el PDF lleva {n} y {m} tal cual, en los dos idiomas", () => {
    // Así lo arma el diálogo; documentoPdf los cambia por los números de cada página.
    expect(t("pdf.pagina", { n: "{n}", m: "{m}" })).toBe("Página {n} de {m}");
    expect(t("pdf.pagina", { n: "{n}", m: "{m}" }, { locale: "en" })).toBe("Page {n} of {m}");
  });
});
