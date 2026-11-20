import { beforeEach, describe, expect, it } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { cambiosFicha, type DatosFicha } from "@/features/trabajadores/validar";
import { SQL_HISTORICO } from "./historico";
import {
  SQL_NOTAS,
  SQL_NOTAS_EXCEL,
  SQL_TRABAJADORES,
  crearTrabajador,
  editarTrabajador,
  eliminarTrabajador,
} from "./trabajadores";

// Contra el esquema real: lo que importa es qué trae la consulta y qué deja en la base una escritura.
let bd: BasePrueba;
let con: string;

const crear = (datos: Parameters<typeof crearTrabajador>[0]) => {
  const t = crearTrabajador(datos);
  bd.aplicar(t.sentencias);
  return t.id;
};
const lista = (sql = SQL_TRABAJADORES) => bd.consultar<Record<string, unknown>>(sql, []);
const columnas = (id: string) =>
  bd.consultar("SELECT nombre, telefono, notas FROM trabajadores WHERE id = ?", [id])[0];

beforeEach(() => {
  bd = abrirBasePrueba();
  con = crear({ nombre: "Con", notas: "una nota" });
});

describe("la lista carga sin foto ni notas", () => {
  it("no trae la foto ni las notas", () => {
    crear({ nombre: "Sin" });
    for (const f of lista()) {
      expect(f).not.toHaveProperty("foto_png");
      expect(f).not.toHaveProperty("tiene_foto");
      expect(f).not.toHaveProperty("notas");
      expect(f.updated_at).toEqual(expect.any(String));
    }
  });

  it("crear y editar una persona no nombran la foto: la base ya no la acepta", () => {
    const sql = [
      ...crearTrabajador({ nombre: "X" }).sentencias,
      ...editarTrabajador(con, { nombre: "Y", notas: "z" }),
    ];
    for (const x of sql) expect(x.sql).not.toContain("foto_png");
  });

  it("deja fuera a los eliminados; ver a una fecha los trae, con el mismo criterio", () => {
    bd.aplicar(eliminarTrabajador(con));
    expect(lista().map((f) => f.id)).not.toContain(con);
    const ida = lista(SQL_HISTORICO.trabajadores).find((f) => f.id === con)!;
    expect(ida.deleted_at).toEqual(expect.any(String));
    expect(ida).not.toHaveProperty("foto_png");
    expect(ida).not.toHaveProperty("notas");
  });

  it("las notas se piden por persona", () => {
    expect(bd.consultar(SQL_NOTAS, [con])).toEqual([{ notas: "una nota" }]);
  });

  it("la exportación completa a Excel las pide todas juntas, solo las que tienen texto", () => {
    crear({ nombre: "Sin" });
    crear({ nombre: "Vacía", notas: "" });
    expect(bd.consultar(SQL_NOTAS_EXCEL, [])).toEqual([{ id: con, notas: "una nota" }]);
  });
});

describe("guardar una ficha no pisa lo que no cargó", () => {
  // Como la ficha recién abierta: lo guardado sin notas (no llegan aún); el formulario, con las notas vacías.
  const base: DatosFicha = {
    nombre: "Con",
    correo: null,
    telefono: null,
    tipo_contrato_id: null,
    sede_id: null,
    jornada_id: null,
    notas: undefined,
  };
  const guardar = (cambios: Partial<DatosFicha>) => bd.aplicar(editarTrabajador(con, cambios));

  it("editar el teléfono con las notas sin cargar conserva las notas", () => {
    guardar(cambiosFicha({ ...base, telefono: "123", notas: "" }, base));
    expect(columnas(con)).toEqual({ nombre: "Con", telefono: "123", notas: "una nota" });
  });

  it("ya cargadas, editar otro campo conserva las notas", () => {
    const cargada = { ...base, notas: "una nota" };
    guardar(cambiosFicha({ ...cargada, nombre: "Otro" }, cargada));
    expect(columnas(con)).toEqual({ nombre: "Otro", telefono: null, notas: "una nota" });
  });

  it("un cambio undefined tampoco llega al UPDATE", () => {
    guardar({ telefono: "9", notas: undefined });
    expect(columnas(con)).toEqual({ nombre: "Con", telefono: "9", notas: "una nota" });
  });
});
