import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { u } from "@/features/arbol/fixture";
import VistaArboles from "./VistaArboles.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
// El modo lado se lee al cargar el módulo: aquí se cambia en cada prueba.
const lado = vi.hoisted(() => ({ activo: false }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));

let pinia: Pinia;
// El html entero: los botones de ícono se nombran en aria-label.
async function html() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/arboles", name: "arboles", component: { render: () => null } }],
  });
  await router.push("/arboles");
  const app = createSSRApp({ render: () => h(VistaArboles) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  const org = useOrganizacion();
  org.unidades = [u("g", TIPO_GERENCIA, "Gerencia", null), u("a", TIPO_AREA, "Finanzas", "g")];
  org.subarboles = [{ id: "s1", unidad_id: "a", nombre: null, orden: 0 }];
});

describe("Árboles en solo lectura", () => {
  it("al lado no ofrece crear, renombrar, mover ni quitar; abrir sigue", async () => {
    lado.activo = true;
    const s = await html();
    for (const accion of [
      "arboles.nuevoArbol",
      "arboles.renombrar",
      "arboles.subir",
      "arboles.bajar",
      "arboles.quitar",
    ])
      expect(s, accion).not.toContain(t(accion));
    expect(s).toContain(t("arboles.abrir"));
    expect(s).toContain("Finanzas");
  });

  it("fuera del lado, todo sigue como antes", async () => {
    lado.activo = false;
    const s = await html();
    for (const accion of [
      "arboles.nuevoArbol",
      "arboles.renombrar",
      "arboles.subir",
      "arboles.bajar",
      "arboles.quitar",
    ])
      expect(s, accion).toContain(t(accion));
  });
});
