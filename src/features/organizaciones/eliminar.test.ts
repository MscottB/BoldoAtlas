import { describe, expect, it } from "vitest";
import type { Organizacion } from "@/db/cliente";
import {
  claveHecha,
  claveQueSeBorra,
  confirmaEliminar,
  espacioQueLibera,
  opcionesEliminar,
  pestanasDe,
  textoAConfirmar,
} from "./eliminar";

const org = (cambios: Partial<Organizacion> = {}): Organizacion => ({
  id: "A",
  nombre: "Acme",
  color: "#3b6fb5",
  abierta: "",
  externa: false,
  ruta: "C:\\datos\\organizaciones\\A\\organizacion.db",
  existe: true,
  activa: false,
  logo: null,
  bytesBase: 100,
  bytesRespaldos: 30,
  ejemplo: false,
  ...cambios,
});

describe("confirmar con el nombre", () => {
  it("sin nombre se confirma con el texto que se muestra", () => {
    expect(textoAConfirmar({ nombre: "" }, "Sin nombre")).toBe("Sin nombre");
    expect(textoAConfirmar({ nombre: "   " }, "Sin nombre")).toBe("Sin nombre");
    expect(confirmaEliminar("Sin nombre", textoAConfirmar({ nombre: "" }, "Sin nombre"))).toBe(true);
  });

  it("muestra el mismo texto que pide, sin espacios de sobra", () => {
    expect(textoAConfirmar({ nombre: " Compañía  Ñandú " }, "Sin nombre")).toBe("Compañía Ñandú");
  });

  it("con tildes y espacios", () => {
    expect(confirmaEliminar("  Compañía  Ñandú ", "Compañía Ñandú")).toBe(true);
    expect(confirmaEliminar("compania ñandu", "Compañía Ñandú")).toBe(false);
  });

  it("la misma palabra en NFD confirma", () => {
    expect(confirmaEliminar("Ñandú".normalize("NFD"), "Ñandú")).toBe(true);
    expect(confirmaEliminar("Ñandú", "Ñandú".normalize("NFD"))).toBe(true);
  });

  it("otro nombre no confirma, y nada no confirma nada", () => {
    expect(confirmaEliminar("Otra", "Acme")).toBe(false);
    expect(confirmaEliminar("", "Acme")).toBe(false);
    expect(confirmaEliminar("", "")).toBe(false);
    expect(confirmaEliminar("  ", " ")).toBe(false);
  });
});

describe("espacioQueLibera", () => {
  it("interna: libera base y respaldos, con cualquier valor de borrarArchivo", () => {
    expect(espacioQueLibera(org(), false)).toBe(130);
    expect(espacioQueLibera(org(), true)).toBe(130);
  });

  it("externa: sin borrar el archivo libera solo los respaldos; borrándolo, también la base", () => {
    expect(espacioQueLibera(org({ externa: true }), false)).toBe(30);
    expect(espacioQueLibera(org({ externa: true }), true)).toBe(130);
  });

  it("lo que no se pudo leer no cuenta", () => {
    expect(espacioQueLibera(org({ bytesBase: Number.NaN }), false)).toBe(30);
    expect(espacioQueLibera(org({ bytesRespaldos: undefined as unknown as number }), false)).toBe(100);
  });
});

describe("pestanasDe", () => {
  it("cuenta las pestañas de la organización", () => {
    const lista = [
      { id: "1", org: "A", ruta: "/" },
      { id: "2", org: "B", ruta: "/" },
      { id: "3", org: "A", ruta: "/directorio" },
    ];
    expect(pestanasDe(lista, "A")).toBe(2);
    expect(pestanasDe(lista, "C")).toBe(0);
  });
});

describe("opcionesEliminar: lo que se le pide a Rust", () => {
  const marcadas = { copia: true, archivo: true };

  it("interna: la copia que se marque, y no hay casilla de archivo", () => {
    expect(opcionesEliminar(org(), marcadas, false)).toEqual({ guardarCopia: true, borrarArchivo: false });
    expect(opcionesEliminar(org(), { copia: false, archivo: false }, false)).toEqual({
      guardarCopia: false,
      borrarArchivo: false,
    });
  });

  it("externa: por defecto solo sale de la lista, sin leer su archivo", () => {
    expect(opcionesEliminar(org({ externa: true }), { copia: true, archivo: false }, false)).toEqual({
      guardarCopia: false,
      borrarArchivo: false,
    });
  });

  it("externa con su casilla: la borra, y entonces sí cuenta la copia", () => {
    expect(opcionesEliminar(org({ externa: true }), marcadas, false)).toEqual({
      guardarCopia: true,
      borrarArchivo: true,
    });
    expect(opcionesEliminar(org({ externa: true }), { copia: false, archivo: true }, false)).toEqual({
      guardarCopia: false,
      borrarArchivo: true,
    });
  });

  it.each([[false], [true]])(
    "sin archivo (externa: %s) nunca van las casillas: Rust daría no_encontrado",
    (externa) => {
      expect(opcionesEliminar(org({ externa }), marcadas, true)).toEqual({
        guardarCopia: false,
        borrarArchivo: false,
      });
    },
  );
});

describe("claveQueSeBorra: qué dice el diálogo", () => {
  it.each([
    ["interna", org(), false, false],
    ["principal", org({ ruta: "C:\\datos\\boldo.db" }), false, false],
    ["principal", org({ ruta: "/datos/boldo.db" }), false, false],
    ["internaSinArchivo", org(), true, false],
    ["internaSinArchivo", org({ ruta: "C:\\datos\\boldo.db" }), true, false],
    ["externa", org({ externa: true, ruta: "D:\\boldo.db" }), false, false],
    ["externaConArchivo", org({ externa: true }), false, true],
    ["externaSinArchivo", org({ externa: true }), true, false],
    ["externaSinArchivo", org({ externa: true }), true, true],
  ] as const)("%s", (clave, o, sinArchivo, borrarArchivo) => {
    expect(claveQueSeBorra(o, sinArchivo, borrarArchivo)).toBe(clave);
  });
});

describe("claveHecha: una externa sin su archivo no se dice eliminada", () => {
  it.each([
    ["hecha", org(), { guardarCopia: false, borrarArchivo: false }],
    ["hechaConCopia", org(), { guardarCopia: true, borrarArchivo: false }],
    ["salio", org({ externa: true }), { guardarCopia: false, borrarArchivo: false }],
    ["hecha", org({ externa: true }), { guardarCopia: false, borrarArchivo: true }],
    ["hechaConCopia", org({ externa: true }), { guardarCopia: true, borrarArchivo: true }],
  ] as const)("%s", (clave, o, opciones) => {
    expect(claveHecha(o, opciones)).toBe(clave);
  });
});
