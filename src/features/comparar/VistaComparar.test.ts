import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, ref, type Component, type Slots } from "vue";
import { renderToString, type SSRContext } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import type {
  DetalleComparado as Detalle,
  FilaComparada,
  Organizacion,
  PaginaComparada,
  ResumenComparacion,
} from "@/db/cliente";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizaciones } from "@/stores/organizaciones";
import DetalleComparado from "./DetalleComparado.vue";
import VistaComparar from "./VistaComparar.vue";

// localStorage simulado desde antes de importar: hay módulos que leen sus preferencias al cargarse.
vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
// Sin DOM: se renderiza en el servidor con el estado ya puesto. Lo que hace cada acción lo cubre comparar.test.ts.
vi.mock("@/db/cliente", () => ({ listarOrganizaciones: vi.fn() }));
// El diálogo de reka solo se abre en el navegador: aquí cada pieza deja ver lo que lleva dentro.
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
    DialogHeader: pasa,
    DialogTitle: pasa,
  };
});
const estado = vi.hoisted(() => ({ actual: null as unknown }));
vi.mock("./comparar", async (original) => ({
  ...(await original<typeof import("./comparar")>()),
  useComparar: () => estado.actual,
}));

const org = (id: string): Organizacion =>
  ({ id, nombre: `Org ${id}`, color: "#112233", abierta: "2026-11-03", existe: true }) as Organizacion;
const resumen = (aproximada: boolean): ResumenComparacion => ({
  otra: "B",
  aproximada,
  sinCorreo: aproximada ? 3 : 0,
  grupos: [
    { tabla: "unidades", soloAqui: 1, soloAlla: 0, difieren: 2 },
    { tabla: "trabajadores", soloAqui: 0, soloAlla: 4, difieren: 0 },
    { tabla: "puestos", soloAqui: 0, soloAlla: 0, difieren: 0 },
  ],
  iguales: 7,
});

function nuevoEstado() {
  return {
    resumen: ref<ResumenComparacion | null>(null),
    pagina: ref<PaginaComparada | null>(null),
    detalle: ref<Detalle | null>(null),
    cargando: ref(false),
    vencida: ref(false),
    trabajo: ref<string | null>(null),
    comparar: vi.fn(),
    verPagina: vi.fn(),
    verDetalle: vi.fn(),
    cancelar: vi.fn(),
    cerrar: vi.fn(),
  };
}

let pinia: Pinia;
async function html(componente: Component, props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/comparar", name: "comparar", component: { render: () => null } }],
  });
  await router.push("/comparar?con=B");
  const app = createSSRApp({ render: () => h(componente, props) });
  app.use(pinia).use(router).use(i18n);
  const ctx: SSRContext = {};
  const cuerpo = await renderToString(app, ctx);
  // Lo que va en un portal (el panel lateral) llega aparte.
  return cuerpo + Object.values(ctx.teleports ?? {}).join("");
}
const texto = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

let e: ReturnType<typeof nuevoEstado>;
beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  const organizaciones = useOrganizaciones();
  organizaciones.lista = [org("A"), org("B")];
  organizaciones.listaAlDia = true;
  e = nuevoEstado();
  estado.actual = e;
});

describe("VistaComparar", () => {
  it("muestra las dos organizaciones y una columna por cada lado", async () => {
    e.resumen.value = resumen(false);
    const t = texto(await html(VistaComparar));
    expect(t).toContain("Org A");
    expect(t).toContain("Solo en Org A");
    expect(t).toContain("Solo en Org B");
    expect(t).toContain("Difieren");
    expect(t).toMatch(/Unidades 1 0 2/);
    expect(t).toMatch(/Personas 0 4 0/);
  });

  it("con coincidencia aproximada lo dice, con cuántas personas quedaron sin correo", async () => {
    e.resumen.value = resumen(true);
    const t = texto(await html(VistaComparar));
    expect(t).toContain("Coincidencia aproximada");
    expect(t).toContain("3 personas no tienen correo");
  });

  it("comparada por id no avisa de coincidencia aproximada", async () => {
    e.resumen.value = resumen(false);
    expect(texto(await html(VistaComparar))).not.toContain("Coincidencia aproximada");
  });

  it("vencida: lo avisa y ofrece Comparar de nuevo", async () => {
    e.resumen.value = resumen(false);
    e.vencida.value = true;
    const t = texto(await html(VistaComparar));
    expect(t).toContain("Esta comparación ya no vale.");
    expect(t).toContain("Comparar de nuevo");
  });

  it("mientras compara muestra el avance con Cancelar", async () => {
    e.cargando.value = true;
    e.trabajo.value = "t1";
    const t = texto(await html(VistaComparar));
    expect(t).toContain("Comparando con «Org B»");
    expect(t).toContain("Cancelar");
  });

  it("lista las filas de la página con su lado", async () => {
    e.resumen.value = resumen(false);
    e.pagina.value = {
      total: 2,
      filas: [
        {
          tabla: "unidades",
          id: "u1",
          nombre: "Finanzas",
          presencia: "solo_aqui",
          columnas: [],
          aproximada: false,
        },
        {
          tabla: "unidades",
          id: "u2",
          nombre: "Ventas",
          presencia: "difieren",
          columnas: ["nombre"],
          aproximada: true,
        },
      ],
    };
    const t = texto(await html(VistaComparar));
    expect(t).toMatch(/Finanzas Unidades Solo en Org A/);
    expect(t).toMatch(/Ventas Unidades Difieren/);
  });
});

describe("DetalleComparado", () => {
  const fila: FilaComparada = {
    tabla: "trabajadores",
    id: "p1",
    nombre: "Ana",
    presencia: "difieren",
    columnas: ["telefono", "puestos"],
    aproximada: false,
  };
  const detalle: Detalle = {
    campos: [
      {
        columna: "telefono",
        mio: { texto: "111", oculto: null, cortado: false },
        archivo: { texto: "222", oculto: null, cortado: false },
        distinto: true,
        delArchivo: false,
      },
    ],
    puestosAqui: ["Jefa · Finanzas"],
    puestosAlla: ["Analista · Ventas"],
    actualizadaAqui: null,
    actualizadaAlla: null,
  };

  it("muestra los dos lados, con el nombre de cada organización como encabezado", async () => {
    const h = await html(DetalleComparado, {
      open: true,
      fila,
      detalle,
      error: "",
      nombreAqui: "Org A",
      nombreAlla: "Org B",
    });
    expect(h).toMatch(/<th[^>]*scope="col"[^>]*>Org A<\/th>/);
    expect(h).toMatch(/<th[^>]*scope="col"[^>]*>Org B<\/th>/);
    const t = texto(h);
    expect(t).toContain("Ana");
    expect(t).toMatch(/Teléfono 111 222/);
    expect(t).toMatch(/Puestos Jefa · Finanzas Analista · Ventas/);
  });
});
