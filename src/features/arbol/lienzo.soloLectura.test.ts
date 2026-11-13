import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import AccionesTarjeta from "./AccionesTarjeta.vue";
import { u } from "./fixture";
import { useLienzo } from "./useLienzo";

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

const gerencia = u("g", TIPO_GERENCIA, "Gerencia", null);
let pinia: Pinia;
beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().unidades = [gerencia, u("a", TIPO_AREA, "Finanzas", "g")];
});

describe("soloLectura del store", () => {
  it("es falso hoy, y verdadero viendo una fecha o al lado", () => {
    lado.activo = false;
    expect(useOrganizacion().soloLectura).toBe(false);
    useOrganizacion().fechaVista = "2026-01-01";
    expect(useOrganizacion().soloLectura).toBe(true);
    lado.activo = true;
    setActivePinia(createPinia());
    expect(useOrganizacion().soloLectura).toBe(true);
  });
});

describe("El lienzo al lado", () => {
  it("no crea, no duplica ni suma a la selección", async () => {
    lado.activo = true;
    const org = useOrganizacion();
    const crear = vi.spyOn(org, "crearUnidad");
    const duplicar = vi.spyOn(org, "duplicarRama");
    const l = useLienzo();
    await l.nuevaUnidad(gerencia);
    await l.duplicar("a");
    l.extender("a");
    expect(crear).not.toHaveBeenCalled();
    expect(duplicar).not.toHaveBeenCalled();
    expect(l.seleccionadas.value.size).toBe(0);
  });

  it("la tarjeta no ofrece nueva subunidad, renombrar ni conectar; plegar y «Más» siguen", async () => {
    const t = (clave: string) => i18n.global.t(clave);
    const html = async () => {
      const app = createSSRApp({ render: () => h(AccionesTarjeta, { id: "g", unidad: gerencia, hijos: 1 }) });
      app.use(pinia).use(i18n);
      return renderToString(app);
    };
    lado.activo = true;
    let s = await html();
    for (const clave of ["arbol.nuevaSubunidad", "arbol.menu.renombrar", "unidad.conectarCon"])
      expect(s, clave).not.toContain(t(clave));
    expect(s).toContain(t("arbol.plegar"));
    expect(s).toContain(t("arbol.acciones.mas"));
    lado.activo = false;
    pinia = createPinia();
    setActivePinia(pinia);
    s = await html();
    for (const clave of ["arbol.nuevaSubunidad", "arbol.menu.renombrar", "unidad.conectarCon"])
      expect(s, clave).toContain(t(clave));
  });
});
