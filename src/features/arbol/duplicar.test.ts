import { beforeEach, describe, expect, it } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import type { Sentencia } from "@/db/cliente";
import { TIPO_AREA, TIPO_GERENCIA, type Conexion, type Puesto, type Unidad } from "@/db/tipos";
import { crearUnidad, asignarJefe, editarUnidad, eliminarUnidad } from "@/db/repos/unidades";
import { crearPuesto, eliminarPuesto } from "@/db/repos/puestos";
import { crearValor } from "@/db/repos/catalogos";
import { crearEtiqueta, etiquetarUnidad } from "@/db/repos/etiquetas";
import { crearConexion, eliminarConexion } from "@/db/repos/conexiones";
import { crearLeyenda } from "@/db/repos/leyendas";
import { crearTrabajador } from "@/db/repos/trabajadores";
import { asignarTitular } from "@/db/repos/asignaciones";
import { duplicarRama, type EstadoRama } from "./duplicar";

let bd: BasePrueba;
beforeEach(() => {
  bd = abrirBasePrueba();
});

/** Todo lo que lee el store, con las filas eliminadas incluidas: la función debe saltárselas. */
const estado = (): EstadoRama => ({
  unidades: bd.consultar<Unidad & { deleted_at: string | null }>("SELECT * FROM unidades"),
  puestos: bd.consultar<Puesto & { deleted_at: string | null }>("SELECT * FROM puestos"),
  unidadEtiquetas: bd.consultar("SELECT unidad_id, etiqueta_id, deleted_at FROM unidad_etiquetas"),
  conexiones: bd.consultar<Conexion & { deleted_at: string | null }>("SELECT * FROM conexiones"),
});
const vivas = <T>(tabla: string) => bd.consultar<T>(`SELECT * FROM ${tabla} WHERE deleted_at IS NULL`);
const aplicar = (...partes: ({ sentencias: Sentencia[] } | Sentencia[])[]) =>
  bd.aplicar(partes.flatMap((x) => (Array.isArray(x) ? x : x.sentencias)));

/** Raíz › {A (orden 0, jefe pa) › {A1 › A11, A2 eliminada}, B (orden 0), C (orden 1)}, con puestos, etiquetas y conexiones. */
function organizacion() {
  const cargo = crearValor("cargos", "Analista");
  const ley = crearLeyenda({ nombre: "Crítico", color: "#be123c" });
  const r = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Raíz" });
  const a = crearUnidad({
    tipo_id: TIPO_AREA,
    nombre: "A",
    descripcion: "Área A",
    parent_id: r.id,
    orden: 0,
  });
  const b = crearUnidad({ tipo_id: TIPO_AREA, nombre: "B", parent_id: r.id, orden: 0 });
  const c = crearUnidad({ tipo_id: TIPO_AREA, nombre: "C", parent_id: r.id, orden: 1 });
  const a1 = crearUnidad({ tipo_id: TIPO_AREA, nombre: "A1", parent_id: a.id, orden: 2 });
  const a11 = crearUnidad({ tipo_id: TIPO_AREA, nombre: "A11", parent_id: a1.id });
  const a2 = crearUnidad({ tipo_id: TIPO_AREA, nombre: "A2", parent_id: a.id });
  const pa = crearPuesto({
    unidad_id: a.id,
    cargo_id: cargo.id,
    descripcion: "Jefa",
    leyenda_id: ley.id,
    orden: 3,
  });
  const pa1 = crearPuesto({ unidad_id: a1.id, cargo_id: cargo.id });
  const pa11 = crearPuesto({ unidad_id: a11.id, cargo_id: cargo.id });
  const pa2 = crearPuesto({ unidad_id: a2.id, cargo_id: cargo.id });
  const pborrado = crearPuesto({ unidad_id: a1.id, cargo_id: cargo.id });
  const ana = crearTrabajador({ nombre: "Ana" });
  const t1 = crearEtiqueta("Crítica", "#c2410c");
  const t2 = crearEtiqueta("Turnos", "#2563eb");
  aplicar(cargo, ley, r, a, b, c, a1, a11, a2, pa, pa1, pa11, pa2, pborrado, ana, t1, t2);
  aplicar(
    editarUnidad(a.id, { marca_color: "#0f766e", marca_codigo: "OP" }),
    asignarJefe(a.id, pa.id),
    asignarJefe(a1.id, pa1.id),
    asignarTitular(pa.id, ana.id, "2026-01-01"),
    asignarTitular(pa1.id, ana.id, "2026-01-01"),
    etiquetarUnidad(a.id, t1.id),
    etiquetarUnidad(a1.id, t1.id),
    etiquetarUnidad(a1.id, t2.id),
    etiquetarUnidad(a2.id, t2.id),
    eliminarPuesto(pborrado.id),
    eliminarUnidad(
      estado().unidades.find((x) => x.id === a2.id)!,
      { hijos: [], puestos: [] },
    ), // su puesto sigue vivo
  );
  const interna = crearConexion(a1.id, a11.id, "apoya");
  const alAfuera = crearConexion(a1.id, b.id, "externa");
  const deLaBorrada = crearConexion(a.id, a2.id, null);
  const eliminada = crearConexion(a.id, a11.id, "vieja");
  aplicar(interna, alAfuera, deLaBorrada, eliminada, eliminarConexion(eliminada.id));
  return { r, a, b, c, a1, a11, a2, pa, pa1, pa11, pa2, ana, t1, t2, interna, alAfuera };
}

describe("duplicarRama", () => {
  it("copia la unidad y sus descendientes vivos con ids nuevos y los vínculos reasignados", () => {
    const o = organizacion();
    const antes = vivas<Unidad>("unidades").length;
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    aplicar(copia);

    const us = vivas<Unidad>("unidades");
    expect(us).toHaveLength(antes + 3); // A, A1 y A11; la A2 eliminada no se copia
    const raiz = us.find((x) => x.id === copia.id)!;
    const a1 = us.find((x) => x.nombre === "A1" && x.id !== o.a1.id)!;
    const a11 = us.find((x) => x.nombre === "A11" && x.id !== o.a11.id)!;
    expect(raiz).toMatchObject({
      nombre: "A (copia)",
      descripcion: "Área A",
      tipo_id: TIPO_AREA,
      parent_id: o.r.id,
      marca_color: "#0f766e",
      marca_codigo: "OP",
    });
    expect(a1).toMatchObject({ parent_id: raiz.id, orden: 2 });
    expect(a11.parent_id).toBe(a1.id);
    expect(new Set([raiz.id, a1.id, a11.id, o.a.id, o.a1.id, o.a11.id]).size).toBe(6);
    expect(us.filter((x) => x.nombre === "A2")).toHaveLength(0);
    // la original no cambia
    expect(us.find((x) => x.id === o.a.id)).toMatchObject({ nombre: "A", jefe_puesto_id: o.pa.id });
  });

  it("solo la raíz de la copia se renombra", () => {
    const o = organizacion();
    aplicar(duplicarRama(estado(), o.a.id, "A (copia)"));
    expect(vivas<Unidad>("unidades").filter((x) => x.nombre.includes("copia"))).toHaveLength(1);
  });

  it("copia los puestos (cargo, descripción, leyenda, orden) sin asignaciones, y no los eliminados", () => {
    const o = organizacion();
    const asignaciones = vivas("asignaciones").length;
    const puestosAntes = vivas<Puesto>("puestos").length;
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    aplicar(copia);

    const ps = vivas<Puesto>("puestos");
    expect(ps).toHaveLength(puestosAntes + 3); // pa, pa1 y pa11; el de A2 (eliminada) y el eliminado de A1, no
    expect(ps.filter((x) => x.unidad_id === o.a.id)).toHaveLength(1); // la original no se toca
    // nacen vacantes: ninguna asignación nueva
    expect(vivas("asignaciones")).toHaveLength(asignaciones);
  });

  it("la jefatura de cada copia apunta al puesto copiado, no al original", () => {
    const o = organizacion();
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    aplicar(copia);
    const us = vivas<Unidad>("unidades");
    const ps = vivas<Puesto>("puestos");
    const raiz = us.find((x) => x.id === copia.id)!;
    const a1 = us.find((x) => x.nombre === "A1" && x.id !== o.a1.id)!;
    const a11 = us.find((x) => x.nombre === "A11" && x.id !== o.a11.id)!;
    expect(ps.find((x) => x.id === raiz.jefe_puesto_id)?.unidad_id).toBe(raiz.id);
    expect(raiz.jefe_puesto_id).not.toBe(o.pa.id);
    expect(ps.find((x) => x.id === a1.jefe_puesto_id)?.unidad_id).toBe(a1.id);
    expect(a11.jefe_puesto_id).toBeNull(); // sin jefatura en la original
  });

  it("copia las etiquetas de cada unidad, no las de las eliminadas", () => {
    const o = organizacion();
    const antes = vivas("unidad_etiquetas").length;
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    aplicar(copia);
    const us = vivas<Unidad>("unidades");
    const etiquetasDe = (id: string) =>
      bd
        .consultar<{ etiqueta_id: string }>(
          "SELECT etiqueta_id FROM unidad_etiquetas WHERE unidad_id = ? AND deleted_at IS NULL",
          [id],
        )
        .map((x) => x.etiqueta_id)
        .sort();
    const a1 = us.find((x) => x.nombre === "A1" && x.id !== o.a1.id)!;
    expect(etiquetasDe(copia.id)).toEqual([o.t1.id]);
    expect(etiquetasDe(a1.id)).toEqual([o.t1.id, o.t2.id].sort());
    expect(etiquetasDe(o.a.id)).toEqual([o.t1.id]); // la original conserva las suyas
    expect(vivas("unidad_etiquetas")).toHaveLength(antes + 3); // 1 de la raíz y 2 de A1
  });

  it("copia solo las conexiones con los dos extremos dentro de la rama", () => {
    const o = organizacion();
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    aplicar(copia);
    const us = vivas<Unidad>("unidades");
    const a1 = us.find((x) => x.nombre === "A1" && x.id !== o.a1.id)!;
    const a11 = us.find((x) => x.nombre === "A11" && x.id !== o.a11.id)!;
    const cs = vivas<Conexion>("conexiones");
    expect(cs.filter((x) => x.origen_id === a1.id || x.destino_id === a1.id)).toEqual([
      expect.objectContaining({ origen_id: a1.id, destino_id: a11.id, etiqueta: "apoya" }),
    ]);
    // la externa (A1 → B), la que va a la unidad eliminada y la eliminada no se copian: 3 vivas originales + 1 nueva
    expect(cs.filter((x) => x.destino_id === o.b.id)).toHaveLength(1);
    expect(cs).toHaveLength(3 + 1);
  });

  it("queda justo después de la original: los hermanos siguientes con el mismo orden se corren", () => {
    const o = organizacion();
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    aplicar(copia);
    const hermanos = vivas<Unidad>("unidades")
      .filter((x) => x.parent_id === o.r.id)
      .sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre, "es"));
    // A (0), B (0), C (1) → A (0), «A (copia)» (1), B (2), C (3)
    expect(hermanos.map((x) => x.nombre)).toEqual(["A", "A (copia)", "B", "C"]);
    expect(new Set(hermanos.map((x) => x.orden)).size).toBe(4);
  });

  it("si hay espacio entre la original y la siguiente, no mueve a nadie", () => {
    const o = organizacion();
    aplicar(editarUnidad(o.c.id, { orden: 10 }), editarUnidad(o.b.id, { orden: 5 }));
    const copia = duplicarRama(estado(), o.a.id, "A (copia)");
    expect(copia.sentencias.filter((s) => /UPDATE unidades SET orden/.test(s.sql))).toEqual([]);
    aplicar(copia);
    expect(vivas<Unidad>("unidades").find((x) => x.id === o.b.id)!.orden).toBe(5);
  });

  it("una raíz se copia como otra raíz", () => {
    const o = organizacion();
    const copia = duplicarRama(estado(), o.r.id, "Raíz (copia)");
    aplicar(copia);
    const us = vivas<Unidad>("unidades");
    expect(us.find((x) => x.id === copia.id)).toMatchObject({ parent_id: null, nombre: "Raíz (copia)" });
    expect(
      us
        .filter((x) => x.parent_id === copia.id)
        .map((x) => x.nombre)
        .sort(),
    ).toEqual(["A", "B", "C"]);
  });

  it("es un solo lote: una transacción, una revisión", () => {
    const o = organizacion();
    const antes = Number(
      bd.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'data_revision'")[0].valor,
    );
    aplicar(duplicarRama(estado(), o.a.id, "A (copia)"));
    expect(
      Number(
        bd.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'data_revision'")[0].valor,
      ),
    ).toBe(antes + 1);
  });
});
