import { describe, expect, it } from "vitest";
import type { FilaDirectorio } from "@/features/directorio/filtrar";
import type { FilaPersonaUnidad } from "@/features/unidades/personas";
import { hojaDirectorio, hojaMantenedor, hojaPersonas, hojaRevision } from "./listas";

const t = (clave: string) => `[${clave}]`;

const fila = (f: Partial<FilaDirectorio>): FilaDirectorio => ({
  clave: "k",
  puestoId: "p1",
  personaId: "w1",
  persona: "Ana",
  reemplazo: null,
  cargo: "Jefa",
  unidadId: "u1",
  ruta: [],
  correo: null,
  tipoContrato: null,
  sede: null,
  jornada: null,
  estado: "ocupado",
  ...f,
});

describe("Directorio", () => {
  const filas = [
    fila({
      persona: "Ana",
      reemplazo: "Beto",
      ruta: [
        { tipoId: "g", nombre: "Operaciones" },
        { tipoId: "a", nombre: "Mantención" },
      ],
      correo: "ana@x.cl",
      sede: "Norte",
    }),
    fila({ clave: "v", personaId: null, persona: null, cargo: "Técnico", estado: "vacante" }),
    fila({ clave: "s", puestoId: null, persona: "Carla", cargo: null, estado: "sinPuesto" }),
  ];
  const tipos = [
    { id: "g", nombre: "Gerencia" },
    { id: "a", nombre: "Área" },
  ];

  it("las columnas a la vista, en el orden de la tabla, y las filas en el orden dado", () => {
    const h = hojaDirectorio(
      filas,
      { reemplazo: true, tipos, tipoContrato: false, sede: true, jornada: false },
      t,
    );
    expect(h.nombre).toBe("[nav.directorio]");
    expect(h.columnas).toEqual([
      "[directorio.persona]",
      "[directorio.cargo]",
      "[directorio.reemplazo]",
      "Gerencia",
      "Área",
      "[directorio.correo]",
      "[directorio.sede]",
    ]);
    expect(h.filas).toEqual([
      ["Ana", "Jefa", "Beto", "Operaciones", "Mantención", "ana@x.cl", "Norte"],
      ["[directorio.vacante]", "Técnico", null, null, null, null, null],
      ["Carla", "[directorio.sinPuesto]", null, null, null, null, null],
    ]);
  });

  it("sin columnas opcionales: persona, cargo y correo", () => {
    const h = hojaDirectorio(
      filas.slice(0, 1),
      { reemplazo: false, tipos: [], tipoContrato: false, sede: false, jornada: false },
      t,
    );
    expect(h.columnas).toEqual(["[directorio.persona]", "[directorio.cargo]", "[directorio.correo]"]);
    expect(h.filas).toEqual([["Ana", "Jefa", "ana@x.cl"]]);
  });

  it("no lleva ids internos", () => {
    const h = hojaDirectorio(
      filas,
      { reemplazo: true, tipos, tipoContrato: true, sede: true, jornada: true },
      t,
    );
    expect(JSON.stringify(h.filas)).not.toMatch(/"(p1|w1|u1|k|v|s)"/);
  });
});

describe("Revisión", () => {
  it("una fila por aviso con su sección y nivel; las personas de un grupo llevan el grupo", () => {
    const h = hojaRevision(
      [
        {
          titulo: "Correos repetidos",
          nivel: "Importante",
          filas: [
            { texto: "ana@x.cl" },
            { texto: "Ana Pérez", hija: true },
            { texto: "Ana P.", detalle: "otra@x.cl", hija: true },
          ],
        },
        {
          titulo: "Vacantes largas",
          nivel: "Importante",
          filas: [{ texto: "Técnico", detalle: "Taller · 120 días" }],
        },
        { titulo: "Reemplazos vigentes", nivel: null, filas: [{ texto: "Beto", detalle: "Jefa · Taller" }] },
      ],
      t,
    );
    expect(h.nombre).toBe("[revision.titulo]");
    expect(h.columnas).toEqual([
      "[excel.revision.seccion]",
      "[excel.revision.nivel]",
      "[excel.revision.aviso]",
      "[excel.revision.detalle]",
    ]);
    expect(h.filas).toEqual([
      ["Correos repetidos", "Importante", "ana@x.cl", null],
      ["Correos repetidos", "Importante", "ana@x.cl", "Ana Pérez"],
      ["Correos repetidos", "Importante", "ana@x.cl", "Ana P. · otra@x.cl"],
      ["Vacantes largas", "Importante", "Técnico", "Taller · 120 días"],
      ["Reemplazos vigentes", null, "Beto", "Jefa · Taller"],
    ]);
  });
});

describe("Mantenedores", () => {
  const valores = [
    { nombre: "Jefa", usos: 3, activo: true },
    { nombre: "Antiguo", usos: 0, activo: false, color: "#112233", descripcion: null },
  ];

  it("nombre, usos y estado, en el orden de la lista", () => {
    const h = hojaMantenedor("Cargos", "Puestos", valores, false, t);
    expect(h.nombre).toBe("Cargos");
    expect(h.columnas).toEqual([
      "[mantenedores.columnas.nombre]",
      "Puestos",
      "[mantenedores.columnas.estado]",
    ]);
    expect(h.filas).toEqual([
      ["Jefa", 3, "[mantenedores.activo]"],
      ["Antiguo", 0, "[mantenedores.inactivo]"],
    ]);
  });

  it("las leyendas suman color y descripción", () => {
    const h = hojaMantenedor("Leyendas", "Puestos", valores, true, t);
    expect(h.columnas).toEqual([
      "[mantenedores.columnas.nombre]",
      "[mantenedores.columnas.color]",
      "[mantenedores.columnas.descripcion]",
      "Puestos",
      "[mantenedores.columnas.estado]",
    ]);
    expect(h.filas[1]).toEqual(["Antiguo", "#112233", null, 0, "[mantenedores.inactivo]"]);
  });
});

describe("Personas de una unidad", () => {
  const persona = (f: Partial<FilaPersonaUnidad>): FilaPersonaUnidad => ({
    clave: "a1",
    personaId: "w1",
    nombre: "Ana",
    correo: "ana@x.cl",
    foto: "http://foto.localhost/x/w1",
    puestoId: "p1",
    cargo: "Jefa",
    tipo: "titular",
    unidadId: "u1",
    unidad: "Taller",
    ...f,
  });

  it("nombre, cargo, tipo y unidad, en el orden dado y sin foto ni ids", () => {
    const h = hojaPersonas(
      [persona({}), persona({ clave: "a2", nombre: "Beto", tipo: "reemplazo" })],
      "Taller",
      t,
    );
    expect(h.nombre).toBe("Taller");
    expect(h.columnas).toEqual([
      "[excel.personas.nombre]",
      "[excel.personas.cargo]",
      "[excel.personas.tipo]",
      "[excel.personas.unidad]",
    ]);
    expect(h.filas).toEqual([
      ["Ana", "Jefa", "[puesto.tipo.titular]", "Taller"],
      ["Beto", "Jefa", "[puesto.tipo.reemplazo]", "Taller"],
    ]);
  });
});
