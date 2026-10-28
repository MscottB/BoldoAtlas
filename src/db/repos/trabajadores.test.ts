import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { crearUnidad } from "./unidades";
import { crearValor } from "./catalogos";
import {
  crearTrabajador,
  editarTrabajador,
  eliminarTrabajador,
  restaurarTrabajador,
  normalizarCorreo,
} from "./trabajadores";

let bd: BasePrueba;
let unidadId: string;
const fila = (id: string) =>
  bd.consultar<{ correo: string | null; nombre: string | null; deleted_at: string | null }>(
    "SELECT * FROM trabajadores WHERE id = ?",
    [id],
  )[0];

beforeEach(() => {
  bd = abrirBasePrueba();
  const u = crearUnidad({ tipo: "gerencia", nombre: "Operaciones" });
  bd.aplicar(u.sentencias);
  unidadId = u.id;
});

describe("normalizarCorreo", () => {
  it("vacío o solo espacios es null; quita espacios y conserva mayúsculas", () => {
    expect(normalizarCorreo("  ")).toBeNull();
    expect(normalizarCorreo(null)).toBeNull();
    expect(normalizarCorreo(" Ana@X.cl ")).toBe("Ana@X.cl");
  });
});

describe("trabajadores", () => {
  it("crea un activo con estado por defecto y correo en blanco como NULL", () => {
    const t = crearTrabajador({ nombre: "Ana", correo: "  ", unidad_id: unidadId });
    bd.aplicar(t.sentencias);
    expect(fila(t.id)).toMatchObject({ nombre: "Ana", correo: null });
  });

  it("vacante sin nombre y con cargo pasa; sin cargo falla por CHECK", () => {
    const cargo = crearValor("cargos", "Analista");
    bd.aplicar(cargo.sentencias);
    const ok = crearTrabajador({ estado: "vacante", cargo_id: cargo.id, unidad_id: unidadId });
    expect(() => bd.aplicar(ok.sentencias)).not.toThrow();
    const mal = crearTrabajador({ estado: "vacante", unidad_id: unidadId });
    expect(() => bd.aplicar(mal.sentencias)).toThrow(/CHECK/);
  });

  it("editarTrabajador guarda NULL con correo en blanco y normaliza el correo", () => {
    const t = crearTrabajador({ nombre: "Ana", correo: "ana@x.cl", unidad_id: unidadId });
    bd.aplicar(t.sentencias);
    bd.aplicar(editarTrabajador(t.id, { correo: "  ", nombre: "Ana María" }));
    expect(fila(t.id)).toMatchObject({ correo: null, nombre: "Ana María" });
    bd.aplicar(editarTrabajador(t.id, { correo: " Ana@X.cl " }));
    expect(fila(t.id).correo).toBe("Ana@X.cl");
  });

  it("eliminar y restaurar marcan y limpian deleted_at", () => {
    const t = crearTrabajador({ nombre: "Ana", unidad_id: unidadId });
    bd.aplicar(t.sentencias);
    bd.aplicar(eliminarTrabajador(t.id));
    expect(fila(t.id).deleted_at).not.toBeNull();
    bd.aplicar(restaurarTrabajador(t.id));
    expect(fila(t.id).deleted_at).toBeNull();
  });
});
