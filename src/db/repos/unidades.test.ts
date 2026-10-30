import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import {
  SQL_UNIDADES,
  crearUnidad,
  editarUnidad,
  moverUnidad,
  asignarJefe,
  eliminarUnidad,
  restaurarUnidad,
} from "./unidades";
import { crearValor } from "./catalogos";
import { crearPuesto } from "./puestos";
import type { Unidad } from "@/db/tipos";

let bd: BasePrueba;
const unidad = (id: string) =>
  bd.consultar<Unidad & { deleted_at: string | null }>("SELECT * FROM unidades WHERE id = ?", [id])[0];

beforeEach(() => {
  bd = abrirBasePrueba();
});

describe("unidades", () => {
  it("crea una raíz y una subunidad con su parent_id", () => {
    const raiz = crearUnidad({ tipo: "gerencia", nombre: "Operaciones" });
    const sub = crearUnidad({ tipo: "area", nombre: "Logística", parent_id: raiz.id });
    bd.aplicar([...raiz.sentencias, ...sub.sentencias]);
    expect(unidad(raiz.id)).toMatchObject({ parent_id: null, orden: 0, descripcion: null });
    expect(unidad(sub.id).parent_id).toBe(raiz.id);
    expect(bd.consultar(SQL_UNIDADES)).toHaveLength(2);
  });

  it("edita (con su marca), mueve y asigna el puesto de jefatura", () => {
    const a = crearUnidad({ tipo: "gerencia", nombre: "A" });
    const b = crearUnidad({ tipo: "area", nombre: "B" });
    const c = crearValor("cargos", "Gerente");
    const p = crearPuesto({ unidad_id: a.id, cargo_id: c.id });
    bd.aplicar([a, b, c, p].flatMap((x) => x.sentencias));
    bd.aplicar(
      editarUnidad(b.id, { nombre: "B2", descripcion: "x", marca_color: "#c2410c", marca_codigo: "OP" }),
    );
    bd.aplicar(moverUnidad(b.id, a.id));
    bd.aplicar(asignarJefe(a.id, p.id));
    expect(unidad(b.id)).toMatchObject({
      nombre: "B2",
      descripcion: "x",
      parent_id: a.id,
      marca_color: "#c2410c",
      marca_codigo: "OP",
    });
    expect(unidad(a.id).jefe_puesto_id).toBe(p.id);
    bd.aplicar(moverUnidad(b.id, null));
    expect(unidad(b.id).parent_id).toBeNull();
  });

  it("editarUnidad rechaza columnas que no se editan por esa vía", () => {
    expect(() => editarUnidad("x", { parent_id: "y" } as never)).toThrow(/no editable/);
  });

  function arbolConContenido() {
    const raiz = crearUnidad({ tipo: "gerencia", nombre: "Raíz" });
    const u = crearUnidad({ tipo: "area", nombre: "Medio", parent_id: raiz.id });
    const hijos = [1, 2].map((n) => crearUnidad({ tipo: "subarea", nombre: `H${n}`, parent_id: u.id }));
    const cargo = crearValor("cargos", "Analista");
    const puestos = [1, 2, 3].map(() => crearPuesto({ unidad_id: u.id, cargo_id: cargo.id }));
    bd.aplicar([raiz, u, cargo, ...hijos, ...puestos].flatMap((x) => x.sentencias));
    return {
      raiz,
      u,
      contenido: { hijos: hijos.map((h) => h.id), puestos: puestos.map((p) => p.id) },
    };
  }

  it("eliminarUnidad pasa hijos y puestos al superior y marca deleted_at", () => {
    const { raiz, u, contenido } = arbolConContenido();
    bd.aplicar(eliminarUnidad(unidad(u.id), contenido));
    expect(unidad(u.id).deleted_at).not.toBeNull();
    for (const h of contenido.hijos) expect(unidad(h).parent_id).toBe(raiz.id);
    expect(bd.consultar("SELECT id FROM puestos WHERE unidad_id = ?", [raiz.id])).toHaveLength(3);
  });

  it("restaurarUnidad devuelve hijos y puestos a la unidad", () => {
    const { u, contenido } = arbolConContenido();
    bd.aplicar(eliminarUnidad(unidad(u.id), contenido));
    bd.aplicar(restaurarUnidad(u.id, contenido));
    expect(unidad(u.id).deleted_at).toBeNull();
    for (const h of contenido.hijos) expect(unidad(h).parent_id).toBe(u.id);
    expect(bd.consultar("SELECT id FROM puestos WHERE unidad_id = ?", [u.id])).toHaveLength(3);
  });

  it("eliminar una unidad sin contenido emite solo el borrado", () => {
    const { u } = arbolConContenido();
    expect(eliminarUnidad(unidad(u.id), { hijos: [], puestos: [] })).toHaveLength(1);
  });
});
