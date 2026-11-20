import { describe, expect, it } from "vitest";
import type { Leyenda, Trabajador } from "@/db/tipos";
import { i18n } from "@/i18n";
import {
  colorEfectivo,
  coloresDeTarjetas,
  datosDePuestos,
  datosDeUnidades,
  etiquetasPorUnidad,
  textoRuta,
} from "./datosNodo";
import { COLORES_ESCALA } from "./escala";
import { a, p, u } from "./fixture";
import { dotacionPorUnidad, vigentesPorPuesto } from "./jerarquia";

const w = (id: string, nombre: string) => ({ id, nombre }) as Trabajador;
const trabajadores = new Map([w("w1", "Ana Rojas"), w("w2", "Beto Díaz")].map((x) => [x.id, x]));
const cargos = new Map([
  ["c-j", "Gerente"],
  ["c-x", "Analista"],
]);
const unidades = [
  { ...u("g", "t", "Gerencia", null), jefe_puesto_id: "p-j" },
  u("a", "t", "Área", "g"),
  u("b", "t", "Otra", "g"),
];
const puestos = [
  { ...p("p-j", "g"), cargo_id: "c-j" },
  { ...p("p-x", "a"), cargo_id: "c-x", leyenda_id: "l1" },
];
const asignaciones = [a("x1", "p-j", "w1", "reemplazo"), a("x2", "p-x", "w2")];
const vigentes = vigentesPorPuesto(asignaciones);

describe("datos de las tarjetas", () => {
  it("datosDeUnidades: jefatura, reemplazo, dotación, etiquetas e hijas", () => {
    const etiquetas = etiquetasPorUnidad(
      [{ id: "e1", nombre: "Clave", color: "#00ff00" }],
      [
        { unidad_id: "g", etiqueta_id: "e1" },
        { unidad_id: "g", etiqueta_id: "borrada" },
      ],
    );
    expect(etiquetas.get("g")!.map((e) => e.nombre)).toEqual(["Clave"]);
    const datos = datosDeUnidades({
      unidades,
      puestos,
      vigentes,
      trabajadores,
      cargos,
      dotaciones: dotacionPorUnidad(unidades, puestos, asignaciones),
      etiquetas,
    });
    expect(datos.get("g")).toMatchObject({
      jefe: { nombre: "Ana Rojas" },
      jefeReemplazo: true,
      cargoJefe: "Gerente",
      total: 1, // el reemplazo no suma: solo el titular de Analista
      vacantes: 1,
      hijos: 2,
    });
    expect(datos.get("g")!.etiquetas).toHaveLength(1);
    expect(datos.get("a")).toMatchObject({ jefe: null, jefeReemplazo: false, total: 1, hijos: 0 });
  });

  it("datosDePuestos: cargo, titular, reemplazo y leyenda", () => {
    const datos = datosDePuestos(puestos, vigentes, trabajadores, cargos);
    expect(datos.get("p-j")).toEqual({
      cargo: "Gerente",
      titular: null,
      reemplazo: "Ana Rojas",
      leyendaId: null,
    });
    expect(datos.get("p-x")).toEqual({
      cargo: "Analista",
      titular: "Beto Díaz",
      reemplazo: null,
      leyendaId: "l1",
    });
  });

  it("textoRuta une los superiores por tipo", () => {
    expect(textoRuta(new Map([["g", [unidades[0]!, unidades[1]!]]]), unidades[2]!)).toBe("Gerencia › Área");
    expect(textoRuta(new Map(), unidades[2]!)).toBe("");
  });

  it("colorEfectivo: el propio y, si no hay, el de la escala", () => {
    expect(colorEfectivo({ color: "#111111" }, { color: "#222222" })).toBe("#111111");
    expect(colorEfectivo({ color: null }, { color: "#222222" })).toBe("#222222");
    expect(colorEfectivo(null, null)).toBeNull();
  });

  it("coloresDeTarjetas: marca con su código, leyenda del puesto y escala con su valor", () => {
    const datosPuesto = datosDePuestos(puestos, vigentes, trabajadores, cargos);
    const leyendas = new Map<string, Leyenda>([
      ["l1", { id: "l1", nombre: "Clave", color: "#ff0000", descripcion: null, orden: 0, deleted_at: null }],
    ]);
    const porMarca = coloresDeTarjetas({
      criterio: "marca:t",
      unidades,
      puestos: datosPuesto,
      marcas: new Map([["a", { color: "#123456", codigo: "AB", unidad: unidades[1]! }]]),
      leyendas,
      escala: null,
      t: i18n.global.t,
    });
    expect(porMarca.get("a")).toEqual({ color: "#123456", texto: "AB" });
    expect(porMarca.get("p-x")).toEqual({ color: "#ff0000" });
    expect(porMarca.has("g")).toBe(false);
    const porEscala = coloresDeTarjetas({
      criterio: "antiguedad",
      unidades,
      puestos: new Map(),
      marcas: null,
      leyendas: null,
      escala: new Map([["g", { valor: 3, rango: 2 }]]),
      t: i18n.global.t,
    });
    expect(porEscala.get("g")).toEqual({ color: COLORES_ESCALA[2], texto: "3 años" });
  });
});
