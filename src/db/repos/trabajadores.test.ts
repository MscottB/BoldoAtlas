import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import {
  crearTrabajador,
  editarTrabajador,
  eliminarTrabajador,
  restaurarTrabajador,
  normalizarCorreo,
} from "./trabajadores";
import { crearUnidad } from "./unidades";
import { crearValor } from "./catalogos";
import { crearPuesto } from "./puestos";
import { asignarTitular, registrarReemplazo } from "./asignaciones";

let bd: BasePrueba;
const fila = (id: string) =>
  bd.consultar<{ correo: string | null; nombre: string | null; deleted_at: string | null }>(
    "SELECT * FROM trabajadores WHERE id = ?",
    [id],
  )[0];

beforeEach(() => {
  bd = abrirBasePrueba();
});

describe("normalizarCorreo", () => {
  it("vacío o solo espacios es null; quita espacios y conserva mayúsculas", () => {
    expect(normalizarCorreo("  ")).toBeNull();
    expect(normalizarCorreo(null)).toBeNull();
    expect(normalizarCorreo(" Ana@X.cl ")).toBe("Ana@X.cl");
  });
});

describe("trabajadores", () => {
  it("crea una persona con correo en blanco como NULL", () => {
    const t = crearTrabajador({ nombre: "Ana", correo: "  " });
    bd.aplicar(t.sentencias);
    expect(fila(t.id)).toMatchObject({ nombre: "Ana", correo: null });
  });

  it("una persona sin nombre falla", () => {
    expect(() => bd.aplicar(crearTrabajador({ nombre: null as never }).sentencias)).toThrow(/NOT NULL/);
  });

  it("editarTrabajador guarda NULL con correo en blanco y normaliza el correo", () => {
    const t = crearTrabajador({ nombre: "Ana", correo: "ana@x.cl" });
    bd.aplicar(t.sentencias);
    bd.aplicar(editarTrabajador(t.id, { correo: "  ", nombre: "Ana María" }));
    expect(fila(t.id)).toMatchObject({ correo: null, nombre: "Ana María" });
    bd.aplicar(editarTrabajador(t.id, { correo: " Ana@X.cl " }));
    expect(fila(t.id).correo).toBe("Ana@X.cl");
  });

  it("eliminar borra sus asignaciones con la misma marca; restaurar devuelve solo esas", () => {
    const u = crearUnidad({ tipo: "gerencia", nombre: "Operaciones" });
    const c = crearValor("cargos", "Analista");
    const p = crearPuesto({ unidad_id: u.id, cargo_id: c.id });
    const t = crearTrabajador({ nombre: "Ana" });
    const vigente = asignarTitular(p.id, t.id, "2026-01-01");
    const antes = registrarReemplazo(p.id, t.id, "2025-01-01", "2025-02-01");
    bd.aplicar([u, c, p, t, antes, vigente].flatMap((x) => x.sentencias));
    bd.db
      .prepare("UPDATE asignaciones SET deleted_at = '2025-06-01T00:00:00.000Z' WHERE id = ?")
      .run(antes.id);
    const borradas = () =>
      bd.consultar<{ id: string; deleted_at: string | null }>(
        "SELECT id, deleted_at FROM asignaciones ORDER BY desde",
      );

    bd.aplicar(eliminarTrabajador(t.id));
    expect(borradas().map((a) => a.deleted_at)).toEqual(["2025-06-01T00:00:00.000Z", fila(t.id).deleted_at]);

    bd.aplicar(restaurarTrabajador(t.id));
    expect(borradas()).toEqual([
      { id: antes.id, deleted_at: "2025-06-01T00:00:00.000Z" }, // borrada antes por su cuenta: sigue borrada
      { id: vigente.id, deleted_at: null },
    ]);
  });

  it("eliminar y restaurar marcan y limpian deleted_at", () => {
    const t = crearTrabajador({ nombre: "Ana" });
    bd.aplicar(t.sentencias);
    bd.aplicar(eliminarTrabajador(t.id));
    expect(fila(t.id).deleted_at).not.toBeNull();
    bd.aplicar(restaurarTrabajador(t.id));
    expect(fila(t.id).deleted_at).toBeNull();
  });
});
