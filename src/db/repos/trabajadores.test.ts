import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import {
  crearTrabajador,
  editarTrabajador,
  eliminarTrabajador,
  restaurarTrabajador,
  normalizarCorreo,
} from "./trabajadores";

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

  it("eliminar y restaurar marcan y limpian deleted_at", () => {
    const t = crearTrabajador({ nombre: "Ana" });
    bd.aplicar(t.sentencias);
    bd.aplicar(eliminarTrabajador(t.id));
    expect(fila(t.id).deleted_at).not.toBeNull();
    bd.aplicar(restaurarTrabajador(t.id));
    expect(fila(t.id).deleted_at).toBeNull();
  });
});
