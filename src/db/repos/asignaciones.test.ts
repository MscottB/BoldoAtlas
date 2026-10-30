import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import type { Asignacion } from "@/db/tipos";
import { crearUnidad } from "./unidades";
import { crearValor } from "./catalogos";
import { crearPuesto, eliminarPuesto } from "./puestos";
import { crearTrabajador, eliminarTrabajador } from "./trabajadores";
import { SQL_ASIGNACIONES, asignarTitular, registrarReemplazo, terminarAsignacion } from "./asignaciones";

let bd: BasePrueba;
let puesto: string;
let ana: string;
let beto: string;

const leer = () => bd.consultar<Asignacion>(SQL_ASIGNACIONES);

beforeEach(() => {
  bd = abrirBasePrueba();
  const u = crearUnidad({ tipo: "gerencia", nombre: "Operaciones" });
  const c = crearValor("cargos", "Analista");
  const p = crearPuesto({ unidad_id: u.id, cargo_id: c.id });
  const a = crearTrabajador({ nombre: "Ana" });
  const b = crearTrabajador({ nombre: "Beto" });
  bd.aplicar([u, c, p, a, b].flatMap((x) => x.sentencias));
  [puesto, ana, beto] = [p.id, a.id, b.id];
});

describe("asignaciones", () => {
  it("asignarTitular cierra la titular vigente en el mismo lote y conserva el historial", () => {
    bd.aplicar(asignarTitular(puesto, ana, "2024-01-01").sentencias);
    const nueva = asignarTitular(puesto, beto, "2026-03-01");
    bd.aplicar(nueva.sentencias);
    expect(leer()).toEqual([
      expect.objectContaining({
        trabajador_id: ana,
        tipo: "titular",
        desde: "2024-01-01",
        hasta: "2026-03-01",
      }),
      {
        id: nueva.id,
        puesto_id: puesto,
        trabajador_id: beto,
        tipo: "titular",
        desde: "2026-03-01",
        hasta: null,
        motivo: null,
      },
    ]);
  });

  it("asignarTitular no toca el reemplazo vigente", () => {
    bd.aplicar(registrarReemplazo(puesto, beto, "2026-01-01").sentencias);
    bd.aplicar(asignarTitular(puesto, ana, "2026-02-01").sentencias);
    expect(leer().filter((a) => a.hasta === null)).toHaveLength(2);
  });

  it("registrarReemplazo acepta un término y rechaza un segundo reemplazo vigente", () => {
    bd.aplicar(registrarReemplazo(puesto, ana, "2026-01-01", "2026-01-31").sentencias);
    bd.aplicar(registrarReemplazo(puesto, ana, "2026-02-01").sentencias);
    expect(leer().map((a) => [a.tipo, a.hasta])).toEqual([
      ["reemplazo", "2026-01-31"],
      ["reemplazo", null],
    ]);
    expect(() => bd.aplicar(registrarReemplazo(puesto, beto, "2026-02-02").sentencias)).toThrow(/UNIQUE/);
  });

  it("terminarAsignacion fija hasta y motivo; hasta anterior a desde falla", () => {
    const a = asignarTitular(puesto, ana, "2026-01-01");
    bd.aplicar(a.sentencias);
    expect(() => bd.aplicar(terminarAsignacion(a.id, "2025-12-31"))).toThrow(/CHECK/);
    bd.aplicar(terminarAsignacion(a.id, "2026-06-30", "Renuncia"));
    expect(leer()[0]).toMatchObject({ hasta: "2026-06-30", motivo: "Renuncia" });
  });

  it("la lectura omite asignaciones de puestos o personas borrados", () => {
    bd.aplicar(asignarTitular(puesto, ana, "2026-01-01").sentencias);
    bd.aplicar(eliminarTrabajador(ana));
    expect(leer()).toEqual([]);
    bd.aplicar(eliminarPuesto(puesto));
    bd.aplicar(registrarReemplazo(puesto, beto, "2026-01-01").sentencias);
    expect(leer()).toEqual([]);
  });
});
