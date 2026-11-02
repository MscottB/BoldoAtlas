import { beforeEach, describe, expect, it } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { cambiosFicha, type DatosFicha } from "@/features/trabajadores/validar";
import { SQL_HISTORICO } from "./historico";
import { SQL_NOTAS, SQL_TRABAJADORES, crearTrabajador, editarTrabajador, eliminarTrabajador } from "./trabajadores";

// Contra el esquema real: lo que importa es qué trae la consulta y qué deja en la base una escritura.
let bd: BasePrueba;
let con: string;
const FOTO = "QUJD";

const crear = (datos: Parameters<typeof crearTrabajador>[0]) => {
  const t = crearTrabajador(datos);
  bd.aplicar(t.sentencias);
  return t.id;
};
const lista = (sql = SQL_TRABAJADORES) => bd.consultar<Record<string, unknown>>(sql, []);
const columnas = (id: string) =>
  bd.consultar("SELECT nombre, telefono, foto_png, notas FROM trabajadores WHERE id = ?", [id])[0];

beforeEach(() => {
  bd = abrirBasePrueba();
  con = crear({ nombre: "Con", foto_png: FOTO, notas: "una nota" });
});

describe("la lista carga sin foto ni notas", () => {
  it("trae el indicador y la versión, nunca el contenido", () => {
    const vacia = crear({ nombre: "Vacía", foto_png: "" });
    const sin = crear({ nombre: "Sin" });
    const filas = lista();
    for (const f of filas) {
      expect(f).not.toHaveProperty("foto_png");
      expect(f).not.toHaveProperty("notas");
      expect(f.updated_at).toEqual(expect.any(String));
    }
    const tiene = new Map(filas.map((f) => [f.id, f.tiene_foto]));
    expect([tiene.get(con), tiene.get(vacia), tiene.get(sin)]).toEqual([1, 0, 0]);
    expect(JSON.stringify(filas)).not.toContain(FOTO);
  });

  it("deja fuera a los eliminados; ver a una fecha los trae, con el mismo criterio", () => {
    bd.aplicar(eliminarTrabajador(con));
    expect(lista().map((f) => f.id)).not.toContain(con);
    const ida = lista(SQL_HISTORICO.trabajadores).find((f) => f.id === con)!;
    expect(ida.tiene_foto).toBe(1);
    expect(ida.deleted_at).toEqual(expect.any(String));
    expect(ida).not.toHaveProperty("foto_png");
    expect(ida).not.toHaveProperty("notas");
  });

  it("las notas se piden por persona", () => {
    expect(bd.consultar(SQL_NOTAS, [con])).toEqual([{ notas: "una nota" }]);
  });
});

describe("guardar una ficha no pisa lo que no cargó", () => {
  // Como la ficha recién abierta: lo guardado sin notas (no llegan aún) y sin foto; el formulario, con las notas vacías.
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

  it("editar el teléfono con las notas sin cargar conserva notas y foto", () => {
    guardar(cambiosFicha({ ...base, telefono: "123", notas: "" }, base));
    expect(columnas(con)).toEqual({ nombre: "Con", telefono: "123", foto_png: FOTO, notas: "una nota" });
  });

  it("ya cargadas, editar otro campo conserva notas y foto", () => {
    const cargada = { ...base, notas: "una nota" };
    guardar(cambiosFicha({ ...cargada, nombre: "Otro" }, cargada));
    expect(columnas(con)).toEqual({ nombre: "Otro", telefono: null, foto_png: FOTO, notas: "una nota" });
  });

  it("quitar la foto a propósito sí la borra, y solo a ella", () => {
    guardar(cambiosFicha({ ...base, notas: "", foto_png: null }, base));
    expect(columnas(con)).toEqual({ nombre: "Con", telefono: null, foto_png: null, notas: "una nota" });
  });

  it("un cambio undefined tampoco llega al UPDATE", () => {
    guardar({ telefono: "9", notas: undefined, foto_png: undefined });
    expect(columnas(con)).toEqual({ nombre: "Con", telefono: "9", foto_png: FOTO, notas: "una nota" });
  });
});
