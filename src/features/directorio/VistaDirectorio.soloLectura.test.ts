import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import VistaDirectorio from "./VistaDirectorio.vue";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
});
const lado = vi.hoisted(() => ({ activo: false }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));

let pinia: Pinia;
async function html() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/directorio", name: "directorio", component: { render: () => null } }],
  });
  await router.push("/directorio");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(VistaDirectorio)) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
});

describe("El directorio vacío", () => {
  it("al lado no invita a crear unidades y puestos", async () => {
    lado.activo = true;
    const s = await html();
    expect(s).not.toContain(t("directorio.vacio"));
    expect(s).toContain(t("directorio.vacioLado"));
  });

  it("fuera del lado, como siempre", async () => {
    lado.activo = false;
    expect(await html()).toContain(t("directorio.vacio"));
  });
});

describe("Exportar esta lista a Excel", () => {
  const conPersona = async () => {
    const { useOrganizacion } = await import("@/stores/organizacion");
    useOrganizacion().trabajadores = [
      {
        id: "t1",
        nombre: "Ana",
        correo: null,
        telefono: null,
        tipo_contrato_id: null,
        sede_id: null,
        jornada_id: null,
        updated_at: "",
      },
    ];
  };

  it("se ofrece con datos, también viendo una fecha (no cambia nada)", async () => {
    lado.activo = false;
    await conPersona();
    const { useOrganizacion } = await import("@/stores/organizacion");
    useOrganizacion().fechaVista = "2026-01-01";
    expect(useOrganizacion().soloLectura).toBe(true);
    expect(await html()).toContain(t("excel.exportar"));
  });

  it("al lado no: es otra organización, solo para mirar", async () => {
    lado.activo = true;
    await conPersona();
    expect(await html()).not.toContain(t("excel.exportar"));
  });
});
