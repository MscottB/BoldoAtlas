import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { TIPO_AREA, TIPO_GERENCIA, type Vista } from "@/db/tipos";
import { crearUnidad, eliminarUnidad } from "./unidades";
import { guardarSubarbol, quitarSubarbol } from "./subarboles";
import { eliminarVista, guardarVista, renombrarVista, restaurarVista, SQL_VISTAS } from "./vistas";

let bd: BasePrueba;
let rama: string; // id del subárbol guardado
let unidadRama: string;

const leer = () => bd.consultar<Vista>(SQL_VISTAS);

beforeEach(() => {
  bd = abrirBasePrueba();
  const raiz = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Raíz" });
  const hija = crearUnidad({ tipo_id: TIPO_AREA, nombre: "A", parent_id: raiz.id });
  const s = guardarSubarbol(hija.id);
  bd.aplicar([...raiz.sentencias, ...hija.sentencias, ...s.sentencias]);
  rama = s.id;
  unidadRama = hija.id;
});

describe("vistas guardadas", () => {
  it("guarda con el nombre recortado y la config como JSON, del árbol completo o de un subárbol", () => {
    const v1 = guardarVista(null, "  Compacta ", { densidad: "compacta" });
    const v2 = guardarVista(rama, "Horizontal", { direccion: "horizontal" });
    bd.aplicar(v1.sentencias);
    bd.aplicar(v2.sentencias);
    expect(leer()).toEqual([
      { id: v1.id, arbol_id: null, nombre: "Compacta", config: '{"densidad":"compacta"}' },
      { id: v2.id, arbol_id: rama, nombre: "Horizontal", config: '{"direccion":"horizontal"}' },
    ]);
  });

  it("renombra y un nombre repetido en el mismo árbol falla sin cambiar nada", () => {
    const a = guardarVista(null, "Uno", {});
    const b = guardarVista(null, "Dos", {});
    bd.aplicar(a.sentencias);
    bd.aplicar(b.sentencias);
    bd.aplicar(renombrarVista(a.id, " Tres "));
    expect(leer().map((v) => v.nombre)).toEqual(["Dos", "Tres"]);
    expect(() => bd.aplicar(renombrarVista(a.id, "dos"))).toThrow(/UNIQUE/);
    expect(leer().map((v) => v.nombre)).toEqual(["Dos", "Tres"]);
  });

  it("elimina de forma lógica y restaura; restaurar choca si el nombre se reutilizó", () => {
    const a = guardarVista(null, "Uno", {});
    bd.aplicar(a.sentencias);
    bd.aplicar(eliminarVista(a.id));
    expect(leer()).toEqual([]);
    expect(bd.consultar("SELECT id FROM vistas")).toHaveLength(1);
    bd.aplicar(restaurarVista(a.id));
    expect(leer()).toHaveLength(1);
    bd.aplicar(eliminarVista(a.id));
    bd.aplicar(guardarVista(null, "uno", {}).sentencias);
    expect(() => bd.aplicar(restaurarVista(a.id))).toThrow(/UNIQUE/);
  });

  it("la lectura omite las de un subárbol quitado", () => {
    bd.aplicar(guardarVista(rama, "De la rama", {}).sentencias);
    bd.aplicar(guardarVista(null, "Completa", {}).sentencias);
    bd.aplicar(quitarSubarbol(rama));
    expect(leer().map((v) => v.nombre)).toEqual(["Completa"]);
  });

  it("la lectura omite las del subárbol de una unidad eliminada", () => {
    bd.aplicar(guardarVista(rama, "De la rama", {}).sentencias);
    bd.aplicar(
      eliminarUnidad(
        {
          id: unidadRama,
          tipo_id: TIPO_AREA,
          nombre: "A",
          descripcion: null,
          parent_id: null,
          jefe_puesto_id: null,
          marca_color: null,
          marca_codigo: null,
          orden: 0,
        },
        { hijos: [], puestos: [] },
      ),
    );
    expect(leer()).toEqual([]);
  });
});
