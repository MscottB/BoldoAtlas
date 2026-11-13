import { describe, expect, it } from "vitest";
import {
  PREFERENCIAS_VIEJAS,
  VISTA_DE_LA_ORGANIZACION,
  VISTA_GENERAL,
  EDITAR,
  centroDelClic,
  constantesActuales,
  constantesSugeridas,
  etiquetaPaleta,
  eventosTecla,
  lineaMedida,
  mediana,
  problemasDeActualizacion,
  problemasDeMigracion,
  textoEs,
} from "./arnes-organizaciones.mjs";

const ID = "0190a000-0000-7000-8000-000000000001";
const DIR = "C:\\temp\\boldo-migracion-x\\datos";
const RUTA_BD = `${DIR}\\boldo.db`;
const PESTANAS = ["p-1", "p-2"];

/** Lo que deja una migración correcta: las viejas igual, sus copias por organización, las pestañas con `org`, sin recientes. */
function migradas(): Record<string, string> {
  return {
    ...PREFERENCIAS_VIEJAS,
    [`boldo:pestanas:${RUTA_BD}`]: JSON.stringify({ lista: PESTANAS.map((id) => ({ id, ruta: "/" })) }),
    // la app reescribe la vista completa al leerla
    [`boldo:vista:${ID}`]: JSON.stringify({ direccion: "horizontal", densidad: "normal" }),
    [`boldo:vista:completo:${ID}`]: JSON.stringify({ direccion: "horizontal", densidad: "normal" }),
    [`boldo:directorio:${ID}`]: PREFERENCIAS_VIEJAS["boldo:directorio"],
    [`boldo:organizaciones:migrado:${DIR}`]: "true",
    [`boldo:pestanas:${DIR}`]: JSON.stringify({
      lista: PESTANAS.map((id) => ({ id, org: ID, ruta: "/" })),
      activa: "p-1",
    }),
  };
}

describe("problemasDeMigracion", () => {
  const base = { id: ID, dirDatos: DIR, rutaBd: RUTA_BD, pestanas: PESTANAS, viejas: PREFERENCIAS_VIEJAS };
  const revisar = (ahora: Record<string, string>) => problemasDeMigracion(ahora, base);

  it("una migración correcta no tiene problemas", () => {
    expect(revisar(migradas())).toEqual([]);
  });

  it("la vista del árbol completo se copió con la de fábrica: el árbol se vería vertical", () => {
    const ahora = migradas();
    ahora[`boldo:vista:completo:${ID}`] = JSON.stringify({ direccion: "vertical" });
    expect(revisar(ahora)).toEqual([expect.stringContaining(`boldo:vista:completo:${ID}`)]);
  });

  it("si la vieja no dejó las vistas en horizontal, la prueba no pasa", () => {
    const viejas = {
      ...PREFERENCIAS_VIEJAS,
      "boldo:vista:completo": JSON.stringify({ direccion: "vertical" }),
    };
    const ahora = { ...migradas(), ...viejas };
    expect(problemasDeMigracion(ahora, { ...base, viejas })).toEqual([
      expect.stringContaining("la vieja no dejó boldo:vista:completo"),
    ]);
  });

  it("una clave vieja que cambió o se borró", () => {
    const ahora = migradas();
    ahora["boldo:vista"] = "{}";
    delete ahora["boldo:plegado:x"];
    delete ahora[`boldo:pestanas:${RUTA_BD}`];
    expect(revisar(ahora)).toHaveLength(3);
  });

  it("la vista de la organización sin lo sembrado: se leyó antes de migrar", () => {
    const ahora = migradas();
    ahora[`boldo:vista:${ID}`] = JSON.stringify({ direccion: "vertical" });
    expect(revisar(ahora)).toEqual([expect.stringContaining(`boldo:vista:${ID}`)]);
  });

  it("el directorio no se copió", () => {
    const ahora = migradas();
    delete ahora[`boldo:directorio:${ID}`];
    expect(revisar(ahora)).toEqual([expect.stringContaining(`boldo:directorio:${ID}`)]);
  });

  it("plegado:* se copió, y es por PC", () => {
    expect(revisar({ ...migradas(), [`boldo:plegado:x:${ID}`]: "true" })).toEqual([
      expect.stringContaining("plegado"),
    ]);
  });

  it("quedan recientes de antes", () => {
    expect(revisar({ ...migradas(), [`boldo:recientes:${RUTA_BD}`]: "[]" })).toEqual([
      expect.stringContaining("recientes"),
    ]);
  });

  it("las pestañas no llegaron, sin org, de otra organización o con otros ids", () => {
    const clave = `boldo:pestanas:${DIR}`;
    const sin = migradas();
    delete sin[clave];
    expect(revisar(sin)).toHaveLength(1);
    const otra = migradas();
    otra[clave] = otra[clave]!.split(ID).join("otra");
    expect(revisar(otra)).toHaveLength(1);
    const otrosIds = migradas();
    otrosIds[clave] = JSON.stringify({
      lista: [
        { id: "x", org: ID },
        { id: "y", org: ID },
      ],
    });
    expect(revisar(otrosIds)).toHaveLength(1);
  });

  it("si la vieja no guardó dos pestañas, la prueba no pasa", () => {
    const una = problemasDeMigracion(migradas(), { ...base, pestanas: ["p-1"] });
    expect(una).toHaveLength(1);
  });
});

describe("problemasDeActualizacion", () => {
  const actualizada = (): Record<string, string> => ({
    "boldo:vista": VISTA_GENERAL,
    [`boldo:vista:${ID}`]: JSON.stringify({ ...VISTA_DE_LA_ORGANIZACION, lineas: "smoothstep" }),
  });
  const revisar = (ahora: Record<string, string>) => problemasDeActualizacion(ahora, { id: ID });

  it("lo de la organización igual y sin recientes no tiene problemas", () => {
    expect(revisar(actualizada())).toEqual([]);
  });

  it("quedan recientes de antes", () => {
    expect(revisar({ ...actualizada(), [`boldo:recientes:${RUTA_BD}`]: "[]" })).toHaveLength(1);
  });

  it("la vista de la organización se pisó con la general, o la general cambió", () => {
    expect(revisar({ ...actualizada(), [`boldo:vista:${ID}`]: VISTA_GENERAL })).toHaveLength(1);
    expect(revisar({ ...actualizada(), "boldo:vista": "{}" })).toHaveLength(1);
  });
});

describe("mediana", () => {
  it("con un número impar, la del medio; con uno par, el promedio de las dos", () => {
    expect(mediana([900, 100, 300])).toBe(300);
    expect(mediana([400, 100, 300, 200])).toBe(250);
  });

  it("no ordena la lista recibida", () => {
    const ms = [3, 1, 2];
    mediana(ms);
    expect(ms).toEqual([3, 1, 2]);
  });
});

describe("etiquetaPaleta", () => {
  it("arma la de la paleta desde es.json, con el nombre y sin la llave", () => {
    for (const accion of ["comparar", "verAlLado"]) {
      const etiqueta = etiquetaPaleta(accion, "Aparte del arnés");
      expect(etiqueta).toContain("Aparte del arnés");
      expect(etiqueta).not.toContain("{");
    }
  });

  it("una acción sin {nombre} lanza", () => {
    expect(() => etiquetaPaleta("ayuda", "x")).toThrow("{nombre}");
  });
});

describe("EDITAR", () => {
  it("cada acción de editar tiene su texto en es.json, sin llaves que rellenar", () => {
    for (const clave of Object.values(EDITAR).flat()) expect(textoEs(clave), clave).not.toContain("{");
  });

  it("cada superficie que el recorrido abre tiene las suyas: el panel de la unidad, la ficha y el puesto", () => {
    expect(Object.keys(EDITAR).sort()).toEqual(["arbol", "arboles", "ficha", "puesto"]);
    for (const clave of [
      "unidad.eliminar",
      "unidad.quitarMarca",
      "unidad.agregarEtiqueta",
      "puesto.nuevoPuesto",
    ])
      expect(EDITAR.arbol).toContain(clave);
    expect(EDITAR.ficha).toContain("ficha.eliminar");
    expect(EDITAR.puesto).toContain("puesto.eliminar");
    // la vista guardada solo está en un menú que el recorrido no abre
    expect(Object.values(EDITAR).flat()).not.toContain("arbol.vistas.guardar");
  });
});

describe("textoEs", () => {
  it("lee de es.json el aviso de coincidencia aproximada", () => {
    expect(textoEs("comparar.aproximada")).toMatch(/\S/);
  });

  it("una clave que no está, o que no es un texto, lanza", () => {
    expect(() => textoEs("comparar.noExiste")).toThrow("comparar.noExiste");
    expect(() => textoEs("comparar")).toThrow();
  });
});

describe("lineaMedida", () => {
  const MB = 2 ** 20;

  it("la mediana de las aperturas y lo que creció la memoria, en MB con un decimal", () => {
    expect(lineaMedida("dividir", [1500.4, 900, 1200], 100 * MB, 130.46 * MB)).toBe(
      "dividir: 1200 ms, memoria: +30.5 MB",
    );
    expect(lineaMedida("ver al lado", [2000], 0, 150 * MB)).toBe("ver al lado: 2000 ms, memoria: +150.0 MB");
  });

  it("si la memoria bajó lleva el signo menos, y sin performance.memory lo dice", () => {
    expect(lineaMedida("dividir", [800], 50 * MB, 48 * MB)).toBe("dividir: 800 ms, memoria: -2.0 MB");
    expect(lineaMedida("dividir", [800, 1000], null, null)).toBe("dividir: 900 ms, memoria: sin medir");
  });
});

describe("constantesActuales", () => {
  it("lee de memoriaLado.ts las tres constantes, en bytes", () => {
    const { BASE_LADO, POR_PERSONA, POR_UNIDAD } = constantesActuales();
    for (const n of [BASE_LADO, POR_PERSONA, POR_UNIDAD]) expect(n).toBeGreaterThan(0);
    expect(BASE_LADO % 2 ** 20).toBe(0);
  });

  it("si una no se escribe <n> * 2 ** <k>, lanza en vez de sugerir sobre otra cosa", () => {
    expect(() => constantesActuales("export const BASE_LADO = 5;")).toThrow("BASE_LADO");
  });
});

describe("constantesSugeridas", () => {
  const MB = 2 ** 20;
  const KB = 2 ** 10;
  const actuales = { BASE_LADO: 120 * MB, POR_PERSONA: 8 * KB, POR_UNIDAD: 4 * KB };
  const grande = { personas: 10_000, unidades: 2_000 };
  const estimado = (c: typeof actuales) => c.BASE_LADO + 10_000 * c.POR_PERSONA + 2_000 * c.POR_UNIDAD;

  it("escala las de ahora para que la grande estime el 50 % sobre lo medido", () => {
    expect(constantesSugeridas((estimado(actuales) * 2) / 3, grande, actuales)).toEqual({
      BASE_LADO: "120 * 2 ** 20",
      POR_PERSONA: "8 * 2 ** 10",
      POR_UNIDAD: "4 * 2 ** 10",
    });
  });

  it("sin una medida útil (cero o menos), no sugiere nada", () => {
    expect(constantesSugeridas(0, grande, actuales)).toBeNull();
    expect(constantesSugeridas(-3 * MB, grande, actuales)).toBeNull();
  });

  it("redondea hacia arriba: lo sugerido nunca queda bajo el 50 % de margen", () => {
    const medido = 37.3 * MB;
    const s = constantesSugeridas(medido, grande, actuales)!;
    const enBytes = (x: string) => {
      const [n, k] = x.split(" * 2 ** ").map(Number);
      return n! * 2 ** k!;
    };
    const sugeridas = {
      BASE_LADO: enBytes(s.BASE_LADO),
      POR_PERSONA: enBytes(s.POR_PERSONA),
      POR_UNIDAD: enBytes(s.POR_UNIDAD),
    };
    expect(estimado(sugeridas)).toBeGreaterThanOrEqual(1.5 * medido);
  });
});

describe("eventosTecla", () => {
  it("abajo y arriba con su código de Windows; Mayús va en los modificadores", () => {
    expect(eventosTecla("F10", true)).toEqual([
      { type: "rawKeyDown", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 },
      { type: "keyUp", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 },
    ]);
    expect(eventosTecla("F6").map((e) => [e.windowsVirtualKeyCode, e.modifiers])).toEqual([
      [117, 0],
      [117, 0],
    ]);
  });

  it("con Ctrl, una letra lleva su código de tecla y el modificador 2", () => {
    expect(eventosTecla("w", false, true)[0]).toEqual({
      type: "rawKeyDown",
      key: "w",
      code: "KeyW",
      windowsVirtualKeyCode: 87,
      modifiers: 2,
    });
  });

  it("una tecla sin código lanza", () => {
    expect(() => eventosTecla("Hyper")).toThrow("Hyper");
  });
});

describe("centroDelClic", () => {
  it("el centro de la caja; sin caja, o sin ancho o alto (oculto), null", () => {
    expect(centroDelClic({ left: 10, top: 20, width: 100, height: 40 })).toEqual({ x: 60, y: 40 });
    expect(centroDelClic(null)).toBeNull();
    expect(centroDelClic({ left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(centroDelClic({ left: 5, top: 5, width: 30, height: 0 })).toBeNull();
  });
});
