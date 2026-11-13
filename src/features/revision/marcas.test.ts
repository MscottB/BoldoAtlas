import { describe, expect, it } from "vitest";
import { desmarcar, leerMarcas, marcar, MOTIVO_MAX, podar, type Marcas } from "./marcas";

const ok = { motivo: "x", fecha: "2026-01-01" };

describe("leerMarcas", () => {
  it.each([undefined, "", "{roto", "3", "[]", "null"])("%j da {}", (t) => {
    expect(leerMarcas(t)).toEqual({});
  });

  it("no toca el prototipo con __proto__", () => {
    const r = leerMarcas('{"__proto__":{"motivo":"x","fecha":"2026-01-01"}}');
    expect(r).toEqual({});
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
  });

  it("descarta lo que no calza y conserva lo válido", () => {
    const texto = JSON.stringify({
      "vacias:u1": { motivo: "  bien  ", fecha: "2026-11-13" },
      "vacias:u2": { motivo: "a".repeat(MOTIVO_MAX + 1), fecha: "2026-11-13" },
      "vacias:u3": { motivo: "   ", fecha: "2026-11-13" },
      "vacias:u4": { motivo: "x", fecha: "ayer" },
      "vacias:u5": { motivo: "x", fecha: "2026-99-99" },
      "vacias:u6": { motivo: "x", fecha: "2026-02-30" },
      "otro:1": ok,
      "sinUso:cargos:c-1": ok,
    });
    expect(leerMarcas(texto)).toEqual({
      "vacias:u1": { motivo: "bien", fecha: "2026-11-13" },
      "sinUso:cargos:c-1": ok,
    });
  });
});

describe("marcar, desmarcar y podar", () => {
  const vigentes = new Set(["vacias:u1", "vacias:u2"]);
  const m: Marcas = { "vacias:u2": ok, "vacias:viejo": ok };

  it("guarda el motivo sin espacios y poda", () => {
    expect(marcar(m, "vacias:u1", "  nueva  ", "2026-11-13", vigentes)).toEqual({
      "vacias:u1": { motivo: "nueva", fecha: "2026-11-13" },
      "vacias:u2": ok,
    });
  });

  it("rechaza un motivo vacío o demasiado largo", () => {
    expect(marcar(m, "vacias:u1", "   ", "2026-11-13", vigentes)).toBeNull();
    expect(marcar(m, "vacias:u1", "a".repeat(MOTIVO_MAX + 1), "2026-11-13", vigentes)).toBeNull();
  });

  it("desmarcar quita la clave y poda; una clave inexistente solo poda", () => {
    expect(desmarcar(m, "vacias:u2", vigentes)).toEqual({});
    expect(desmarcar(m, "vacias:u1", vigentes)).toEqual({ "vacias:u2": ok });
  });

  it("podar deja solo las vigentes", () => {
    expect(podar(m, vigentes)).toEqual({ "vacias:u2": ok });
  });
});
