import { describe, expect, it } from "vitest";
import type { Leyenda } from "@/db/tipos";
import { i18n } from "@/i18n";
import { COLOR_NEUTRO, COLORES_ESCALA, type ValorEscala } from "./escala";
import { u } from "./fixture";
import { marcasPorUnidad } from "./jerarquia";
import { leyendaDeColores } from "./leyenda";
import { CRITERIO_LEYENDA } from "./vista";

// La leyenda de «Colorear por» la comparten el lienzo y la imagen exportada.
const t = i18n.global.t;
const nodos = [u("a", "t-g", "Gerencia", null), u("b", "t-a", "Finanzas", "a")];
const ley = (id: string, nombre: string, color: string): Leyenda => ({
  id,
  nombre,
  color,
  descripcion: `Sobre ${nombre}`,
  orden: 0,
  deleted_at: null,
});
const base = {
  escala: null,
  marcas: null,
  tipoMarca: null,
  tipos: [
    { id: "t-g", nombre: "Gerencia" },
    { id: "t-a", nombre: "Área" },
  ],
  leyendas: [],
  nodos,
  puestos: [],
  t,
};

describe("leyendaDeColores", () => {
  it("con un criterio de escala: los rangos en uso de menor a mayor, y después lo que va aparte", () => {
    const escala = new Map<string, ValorEscala>([
      ["a", { valor: 7, rango: 3 }],
      ["b", { valor: 0.5, rango: 0 }],
      ["p1", { aparte: "vacante" }],
      ["fuera", { valor: 2, rango: 1 }], // no se dibuja: no entra
    ]);
    const l = leyendaDeColores({
      ...base,
      criterio: "antiguedad",
      escala,
      puestos: [{ id: "p1", leyenda_id: null }],
    });
    expect(l.titulo).toBe(t("arbol.vista.antiguedad"));
    expect(l.entradas).toEqual([
      { clave: "0", color: COLORES_ESCALA[0], nombre: t("arbol.vista.rangos.antiguedad.0") },
      { clave: "3", color: COLORES_ESCALA[3], nombre: t("arbol.vista.rangos.antiguedad.3") },
      { clave: "vacante", color: COLOR_NEUTRO, nombre: t("arbol.vista.aparte.vacante") },
    ]);
  });

  it("por leyenda del puesto: las entradas que usan los puestos dibujados, en el orden de la lista", () => {
    const leyendas = [
      ley("l1", "Crítico", "#ff0000"),
      ley("l2", "Nuevo", "#00ff00"),
      ley("l3", "Sin uso", "#0000ff"),
    ];
    const l = leyendaDeColores({
      ...base,
      criterio: CRITERIO_LEYENDA,
      leyendas,
      puestos: [
        { id: "p1", leyenda_id: "l2" },
        { id: "p2", leyenda_id: "l1" },
        { id: "p3", leyenda_id: null },
      ],
    });
    expect(l.titulo).toBe(t("arbol.vista.leyendaPuesto"));
    expect(l.entradas).toEqual([
      { clave: "l1", color: "#ff0000", nombre: "Crítico", descripcion: "Sobre Crítico" },
      { clave: "l2", color: "#00ff00", nombre: "Nuevo", descripcion: "Sobre Nuevo" },
    ]);
  });

  it("por marca de un tipo: una entrada por unidad que define la marca, con su código", () => {
    const conMarca = [{ ...nodos[0]!, marca_color: "#123456", marca_codigo: "GG" }, nodos[1]!];
    const l = leyendaDeColores({
      ...base,
      criterio: "marca:t-g",
      marcas: marcasPorUnidad(conMarca, "t-g"),
      tipoMarca: "t-g",
      nodos: conMarca,
    });
    expect(l.titulo).toBe(t("arbol.vista.marcaDe", { tipo: "Gerencia" }));
    // Finanzas hereda la marca de la Gerencia: no se repite.
    expect(l.entradas).toEqual([{ clave: "a", color: "#123456", codigo: "GG", nombre: "Gerencia" }]);
  });
});
