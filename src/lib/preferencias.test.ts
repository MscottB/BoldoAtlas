import { afterEach, describe, expect, it, vi } from "vitest";
import { fijarBase } from "./baseActiva";
import {
  borrarPreferenciasOrg,
  guardarPreferencia,
  guardarPreferenciaOrg,
  leerPreferencia,
  leerPreferenciaOrg,
  migrarPreferencias,
} from "./preferencias";

afterEach(() => {
  vi.unstubAllGlobals();
  fijarBase("");
});

// Un localStorage de verdad: migrarPreferencias lo recorre con length y key(i).
function simularAlmacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
    removeItem: (k: string) => datos.delete(k),
    get length() {
      return datos.size;
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
  });
  return datos;
}

describe("borrarPreferenciasOrg", () => {
  it("quita las de esa organización y deja las demás", () => {
    const datos = simularAlmacen({
      "boldo:vista:A": "1",
      "boldo:minimapa:A": "1",
      "boldo:vista:arbol:A": "1",
      "boldo:directorio:columnas:A": "1",
      "boldo:vista:B": "2",
      "boldo:minimapa:B": "2",
      "boldo:vista": "por PC",
      "boldo:tema": "por PC",
      "boldo:plegado:A": "no es de una organización",
      "otra:vista:A": "ajena",
    });
    borrarPreferenciasOrg("A");
    expect([...datos.keys()].sort()).toEqual([
      "boldo:minimapa:B",
      "boldo:plegado:A",
      "boldo:tema",
      "boldo:vista",
      "boldo:vista:B",
      "otra:vista:A",
    ]);
  });

  it("sin id no borra nada, y sin localStorage no falla", () => {
    const datos = simularAlmacen({ "boldo:vista:": "1", "boldo:vista": "por PC" });
    borrarPreferenciasOrg("");
    expect(datos.size).toBe(2);
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("bloqueado");
      },
    });
    expect(() => borrarPreferenciasOrg("A")).not.toThrow();
  });
});

describe("preferencias", () => {
  it("leerPreferencia usa el valor por defecto si localStorage falla", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(leerPreferencia("tema", "claro")).toBe("claro");
    expect(() => guardarPreferencia("tema", "oscuro")).not.toThrow();
  });

  it("guarda y lee JSON con prefijo boldo:", () => {
    const datos = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => datos.set(k, v),
    });
    guardarPreferencia("escala", 110);
    expect(datos.get("boldo:escala")).toBe("110");
    expect(leerPreferencia("escala", 100)).toBe(110);
  });

  it("devuelve el valor por defecto si el JSON guardado es inválido", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{roto", setItem: () => {} });
    expect(leerPreferencia("escala", 100)).toBe(100);
  });

  it("cada organización lee y guarda lo suyo", () => {
    const datos = simularAlmacen();
    fijarBase("A");
    guardarPreferenciaOrg("minimapa", true);
    expect(datos.get("boldo:minimapa:A")).toBe("true");
    expect(leerPreferenciaOrg("minimapa", false)).toBe(true);
    fijarBase("B");
    expect(leerPreferenciaOrg("minimapa", false)).toBe(false);
  });

  it("sin base no guarda nada", () => {
    const datos = simularAlmacen();
    guardarPreferenciaOrg("minimapa", true);
    expect(datos.size).toBe(0);
    expect(leerPreferenciaOrg("minimapa", "x")).toBe("x");
  });
});

describe("migrarPreferencias", () => {
  const antiguas = {
    "boldo:vista": '{"a":1}',
    "boldo:vista:completo": '{"b":2}',
    "boldo:vista:0192f0aa-0000-7000-8000-000000000001": '{"c":3}',
    "boldo:directorio": '{"d":4}',
    "boldo:directorio:columnas": '["e"]',
    "boldo:personas:vista": '"arbol"',
    "boldo:minimapa": "true",
  };

  it("copia a la clave de la organización y deja la antigua", () => {
    const datos = simularAlmacen({ ...antiguas, "boldo:plegado:x": "true" });
    migrarPreferencias("A", "C:/datos");
    for (const [k, v] of Object.entries(antiguas)) {
      expect(datos.get(`${k}:A`)).toBe(v);
      expect(datos.get(k)).toBe(v);
    }
    expect(datos.has("boldo:plegado:x:A")).toBe(false);
  });

  it("no migra tema, idioma, respaldos ni recientes", () => {
    const datos = simularAlmacen({
      "boldo:tema": '"oscuro"',
      "boldo:idioma": '"es"',
      "boldo:respaldos:frecuencia": '"diaria"',
      "boldo:recientes:C:/datos/boldo.db": "[]",
      "otra:vista": "1",
    });
    migrarPreferencias("A", "C:/datos");
    expect([...datos.keys()].filter((k) => k.endsWith(":A"))).toEqual([]);
  });

  it("no pisa lo ya guardado y corre una vez por copia", () => {
    const datos = simularAlmacen({ "boldo:minimapa": "true", "boldo:minimapa:A": "false" });
    migrarPreferencias("A", "C:/datos");
    expect(datos.get("boldo:minimapa:A")).toBe("false");

    datos.set("boldo:vista", '{"nueva":1}');
    migrarPreferencias("A", "C:/datos");
    expect(datos.has("boldo:vista:A")).toBe(false);

    migrarPreferencias("A", "D:/otra");
    expect(datos.get("boldo:vista:A")).toBe('{"nueva":1}');
  });

  it("borra el «Abierto recientemente» de antes, que nombra personas, aunque ya se haya migrado", () => {
    const datos = simularAlmacen({
      "boldo:recientes:C:/datos/boldo.db": '[{"ruta":"/directorio?persona=p1","en":1}]',
      "boldo:recientes:D:/otra/boldo.db": "[]",
      "boldo:organizaciones:migrado:C:/datos": "true",
      "boldo:tema": '"oscuro"',
      "otra:recientes:x": "1",
    });
    migrarPreferencias("A", "C:/datos");
    expect([...datos.keys()].sort()).toEqual([
      "boldo:organizaciones:migrado:C:/datos",
      "boldo:tema",
      "otra:recientes:x",
    ]);
  });

  it("una segunda copia no copia lo ya copiado a una clave doble", () => {
    const datos = simularAlmacen({ "boldo:vista": "1", "boldo:vista:completo": "2" });
    migrarPreferencias("A", "C:/datos");
    migrarPreferencias("B", "D:/otra");
    expect(datos.get("boldo:vista:completo:B")).toBe("2");
    expect(datos.has("boldo:vista:completo:A:B")).toBe(false);
  });
});
