import { describe, expect, it, vi } from "vitest";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import DetalleAccion from "./DetalleAccion.vue";
import type { AccionBreve, FilaDetalle, Pregunta } from "./tipos";

// Los diálogos de reka solo se abren en el navegador: aquí dejan ver lo que llevan.
vi.mock("@/components/ui/alert-dialog", async () => {
  const { h: hh } = await import("vue");
  const pasa = (tag: string) => ({
    setup:
      (_: unknown, { slots }: { slots: Slots }) =>
      () =>
        hh(tag, slots.default?.()),
  });
  return {
    AlertDialog: pasa("div"),
    AlertDialogAction: pasa("button"),
    AlertDialogCancel: pasa("button"),
    AlertDialogContent: pasa("div"),
    AlertDialogDescription: pasa("div"),
    AlertDialogFooter: pasa("div"),
    AlertDialogHeader: pasa("div"),
    AlertDialogTitle: pasa("div"),
  };
});

const renombrar = (
  id: string,
  antes: string,
  despues: string,
  extra: Partial<AccionBreve> = {},
): AccionBreve => ({
  id,
  fecha: "2026-11-18T09:00:00.000Z",
  origen: "app",
  datos: {},
  estado: "hecha",
  bloqueada: false,
  filas: 1,
  muestra: [
    {
      tabla: "unidades",
      fila_id: "u1",
      op: "update",
      campos: ["nombre"],
      nombre: despues,
      nombre_antes: antes,
      nombre_despues: despues,
      elimina: false,
    },
  ],
  ...extra,
});
const filas: FilaDetalle[] = [
  {
    tabla: "unidades",
    fila_id: "u1",
    op: "update",
    nombre: "Norte",
    campos: [
      ["nombre", "Ventas", "Norte"],
      ["updated_at", "a", "b"],
    ],
  },
  { tabla: "puestos", fila_id: "p1", op: "insert", nombre: "Jefe", campos: [["descripcion", null, "Turno"]] },
];

async function html(props: {
  pregunta?: Pregunta | null;
  accion?: AccionBreve;
  filas?: FilaDetalle[] | null;
}) {
  const app = createSSRApp({
    render: () =>
      h(DetalleAccion, { accion: renombrar("1", "Ventas", "Norte"), filas, soloLectura: false, ...props }),
  });
  app.use(i18n);
  return renderToString(app);
}
const t = (k: string, v: Record<string, unknown> = {}) => i18n.global.t(k, v);

describe("DetalleAccion", () => {
  it("cada fila, campo por campo: antes → después en un cambio, y lo que trae al crear", async () => {
    const s = await html({});
    expect(s).toContain(`${t("intercambio.columnas.nombre")}</dt>`);
    expect(s).toContain("Ventas → Norte");
    expect(s).toContain("Turno");
    expect(s).not.toContain("updated_at");
    expect(s).toContain(t("historial.vista.op.insert"));
    expect(await html({ filas: null })).toContain(t("historial.vista.cargando"));
  });

  it("hecha: deshacer y volver a este punto; deshecha: rehacer", async () => {
    const hecha = await html({});
    expect(hecha).toContain(t("historial.vista.deshacer"));
    expect(hecha).toContain(t("historial.vista.volver"));
    const deshecha = await html({ accion: renombrar("1", "Ventas", "Norte", { estado: "deshecha" }) });
    expect(deshecha).toContain(t("historial.vista.rehacer"));
    expect(deshecha).not.toContain(t("historial.vista.volver"));
  });

  it("el conflicto nombra las acciones que van juntas y ofrece hacerlas todas en un paso", async () => {
    const s = await html({
      pregunta: {
        tipo: "juntas",
        sentido: "deshacer",
        acciones: [renombrar("2", "Norte", "Sur"), renombrar("3", "Sur", "Este")],
      },
    });
    expect(s).toContain(t("historial.vista.juntas.texto.deshacer"));
    expect(s).toContain("Renombraste Norte a Sur");
    expect(s).toContain("Renombraste Sur a Este");
    expect(s).toContain(t("historial.vista.juntas.boton.deshacer", { n: 3 }));
    expect(s).toContain(t("historial.vista.cancelar"));
    const rehacer = await html({
      pregunta: { tipo: "juntas", sentido: "rehacer", acciones: [renombrar("2", "Norte", "Sur")] },
    });
    expect(rehacer).toContain(t("historial.vista.juntas.boton.rehacer", { n: 2 }));
  });

  it("volver a este punto confirma con cuántas deshace", async () => {
    const s = await html({ pregunta: { tipo: "volver", n: 4 } });
    expect(s).toContain(i18n.global.t("historial.vista.volverTexto", { n: 4 }, 4));
  });
});
