import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { CONTEXTO_LIENZO, type ContextoLienzo } from "@/features/arbol/contexto";
import { u } from "@/features/arbol/fixture";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import EditorConexion from "./EditorConexion.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
const lado = vi.hoisted(() => ({ activo: false }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));

let pinia: Pinia;
async function html() {
  const app = createSSRApp({ render: () => h(EditorConexion, { id: "x1" }) });
  const contexto = { mostradas: computed(() => useOrganizacion().unidades) } as unknown as ContextoLienzo;
  app.use(pinia).use(i18n).provide(CONTEXTO_LIENZO, contexto);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  const org = useOrganizacion();
  org.unidades = [
    u("g", TIPO_GERENCIA, "Gerencia", null),
    u("a", TIPO_AREA, "Finanzas", "g"),
    u("c", TIPO_AREA, "Compras", "g"),
  ];
  org.conexiones = [{ id: "x1", origen_id: "a", destino_id: "c", etiqueta: "Abastece" }];
});

describe("La ventanita de una conexión en solo lectura", () => {
  it("al lado se lee, sin invertir ni eliminar ni el aviso de la fecha", async () => {
    lado.activo = true;
    const s = await html();
    expect(s).toContain("Abastece");
    expect(s).not.toContain(t("conexion.invertir"));
    expect(s).not.toContain(t("conexion.eliminar"));
    expect(s).not.toContain(t("arbol.fecha.panelSoloLectura"));
  });

  it("viendo una fecha, como hoy: Invertir deshabilitado y el aviso de la fecha", async () => {
    lado.activo = false;
    useOrganizacion().fechaVista = "2026-01-01";
    const s = await html();
    expect(s).toMatch(
      new RegExp(`<button[^>]*\\sdisabled[^>]*>(?:(?!</button>).)*${t("conexion.invertir")}`),
    );
    expect(s).toContain(t("arbol.fecha.panelSoloLectura"));
  });

  it("fuera del lado y de una fecha, se edita", async () => {
    lado.activo = false;
    const s = await html();
    expect(s).toContain(t("conexion.invertir"));
    expect(s).toContain(t("conexion.eliminar"));
  });
});
