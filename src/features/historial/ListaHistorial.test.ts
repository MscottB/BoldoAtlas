import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import ListaHistorial from "./ListaHistorial.vue";
import type { AccionBreve, FilaDetalle } from "./tipos";

const accion = (id: string, fecha: string, extra: Partial<AccionBreve> = {}): AccionBreve => ({
  id,
  fecha,
  origen: "app",
  datos: {},
  estado: "hecha",
  bloqueada: false,
  filas: 2,
  muestra: [
    {
      tabla: "unidades",
      fila_id: "u1",
      op: "update",
      campos: ["nombre"],
      nombre: "Norte",
      nombre_antes: "Ventas",
      nombre_despues: "Norte",
      elimina: false,
    },
  ],
  ...extra,
});
const detalle: FilaDetalle[] = [
  {
    tabla: "unidades",
    fila_id: "u1",
    op: "update",
    nombre: "Norte",
    campos: [["nombre", "Ventas", "Norte"]],
  },
];

async function html(acciones: AccionBreve[], soloLectura = false, abierta: string | null = null) {
  const app = createSSRApp({
    render: () => h(ListaHistorial, { acciones, soloLectura, abierta, zona: "UTC", filas: detalle }),
  });
  app.use(i18n);
  return renderToString(app);
}
const t = (k: string, v: Record<string, unknown> = {}) => i18n.global.t(k, v);
const BOTONES = [
  "historial.vista.deshacer",
  "historial.vista.rehacer",
  "historial.vista.volver",
  "historial.vista.irA",
];

describe("ListaHistorial", () => {
  it("agrupa por día, y las deshechas se ven atenuadas con «Deshecha» sobre «Estás aquí»", async () => {
    const s = await html([
      accion("3", "2026-11-18T10:00:00.000Z", { estado: "deshecha" }),
      accion("2", "2026-11-18T09:00:00.000Z"),
      accion("1", "2026-11-17T09:00:00.000Z"),
    ]);
    expect(s.split("<h3").length - 1).toBe(2);
    expect(s).toContain("Renombraste Ventas a Norte y 1 cambio más");
    expect(s).toContain(t("historial.vista.elementos", { n: 2 }));
    const deshecha = /<li[^>]*data-accion="3"[\s\S]*?<\/li>/.exec(s)![0];
    expect(deshecha).toContain(t("historial.estado.deshecha"));
    expect(deshecha).toContain("opacity-60");
    expect(/<li[^>]*data-accion="2"[\s\S]*?<\/li>/.exec(s)![0]).not.toContain("opacity-60");
    // una sola línea, en la fila de la primera hecha y antes de su frase
    const linea = s.indexOf(t("historial.vista.estasAqui"));
    const fila2 = s.indexOf('data-accion="2"');
    expect(s.split(t("historial.vista.estasAqui")).length - 1).toBe(1);
    expect(linea).toBeGreaterThan(fila2);
    expect(linea).toBeLessThan(s.indexOf("<button", fila2));
  });

  it("la abierta muestra su detalle y sus botones; en solo lectura, el detalle sin botones", async () => {
    const lista = [accion("2", "2026-11-18T09:00:00.000Z"), accion("1", "2026-11-17T09:00:00.000Z")];
    const abierta = await html(lista, false, "2");
    expect(abierta).toContain('aria-expanded="true"');
    for (const b of ["historial.vista.deshacer", "historial.vista.volver"]) expect(abierta).toContain(t(b));
    const soloLectura = await html(lista, true, "2");
    expect(soloLectura).toContain("Ventas → Norte");
    for (const b of BOTONES) expect(soloLectura).not.toContain(t(b));
  });

  it("una bloqueada dice por qué y no se puede deshacer", async () => {
    const s = await html([accion("2", "2026-11-18T09:00:00.000Z", { bloqueada: true })], false, "2");
    expect(s).toContain(t("historial.vista.bloqueadaPersona"));
    expect(s).not.toContain(t("historial.vista.deshacer"));
    const suprimir = await html([
      accion("1", "2026-11-18T09:00:00.000Z", { origen: "suprimir", bloqueada: true, datos: { id: "w1" } }),
    ]);
    expect(suprimir).toContain(t("historial.vista.bloqueadaSuprimir"));
  });
});
