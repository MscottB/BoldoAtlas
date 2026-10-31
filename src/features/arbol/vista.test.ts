import { describe, expect, it } from "vitest";
import type { Leyenda } from "@/db/tipos";
import {
  CRITERIO_LEYENDA,
  VISTA_POR_DEFECTO,
  aplicarVista,
  arbolDeVista,
  configDeVista,
  jefeEnTarjeta,
  leerVista,
  leyendasEnUso,
  opcionesElk,
  separaciones,
  sinResaltar,
  tamPuesto,
  tamUnidad,
  tipoArista,
  tipoDeMarca,
} from "./vista";

describe("leerVista", () => {
  it("sin datos o con basura devuelve los valores por defecto", () => {
    for (const crudo of [null, undefined, 3, "x", [], true])
      expect(leerVista(crudo)).toEqual(VISTA_POR_DEFECTO);
    expect(VISTA_POR_DEFECTO.verPuestos).toBe(false);
    expect(VISTA_POR_DEFECTO.alinearPorTipo).toBe(false);
  });

  it("acepta una configuración válida y descarta claves desconocidas", () => {
    const v = {
      ...VISTA_POR_DEFECTO,
      direccion: "horizontal",
      densidad: "compacta",
      lineas: "bezier",
      mostrarJefe: false,
      mostrarEtiquetas: false,
      personasEnTarjetas: false,
      resaltar: { ...VISTA_POR_DEFECTO.resaltar, texto: "ope", vacantes: true, sede: "s1", cargo: "c1" },
      verPuestos: true,
      alinearPorTipo: true,
      mostrarCargo: false,
      mostrarPersona: true,
      rutaTipos: ["a", "b"],
      colorearPor: "marca:a",
      leyenda: false,
    };
    expect(leerVista({ ...v, otra: 1 })).toEqual(v);
  });

  it("cada campo inválido vuelve a su valor por defecto sin afectar a los demás", () => {
    const r = leerVista({
      verPuestos: "si",
      mostrarCargo: false,
      rutaTipos: ["a", 2],
      colorearPor: "rojo",
      leyenda: 0,
    });
    expect(r).toEqual({ ...VISTA_POR_DEFECTO, mostrarCargo: false });
  });

  it("«Personas en las tarjetas»: lo guardado antes de existir la opción la deja activa", () => {
    const anterior: Partial<typeof VISTA_POR_DEFECTO> = { ...VISTA_POR_DEFECTO, mostrarTipo: false };
    delete anterior.personasEnTarjetas;
    expect(leerVista(anterior)).toEqual({ ...VISTA_POR_DEFECTO, mostrarTipo: false, personasEnTarjetas: true });
    expect(leerVista({ personasEnTarjetas: false }).personasEnTarjetas).toBe(false);
    expect(leerVista({ personasEnTarjetas: "no" }).personasEnTarjetas).toBe(true);
  });

  it("alinearPorTipo acepta la clave anterior (nivelesEstrictos) de preferencias y vistas guardadas", () => {
    expect(leerVista({ nivelesEstrictos: true }).alinearPorTipo).toBe(true);
    expect(leerVista({ nivelesEstrictos: true, alinearPorTipo: false }).alinearPorTipo).toBe(false);
    expect(leerVista({ nivelesEstrictos: "si" }).alinearPorTipo).toBe(false);
    expect(leerVista({ nivelesEstrictos: true })).not.toHaveProperty("nivelesEstrictos");
  });

  it("dirección, densidad y líneas solo aceptan sus valores", () => {
    const r = leerVista({ direccion: "diagonal", densidad: "enorme", lineas: "step" });
    expect([r.direccion, r.densidad, r.lineas]).toEqual(["vertical", "normal", "smoothstep"]);
    expect(leerVista({ direccion: "horizontal", densidad: "compacta", lineas: "bezier" })).toMatchObject({
      direccion: "horizontal",
      densidad: "compacta",
      lineas: "bezier",
    });
  });

  it("resaltar: valida cada criterio por separado y nunca comparte el objeto por defecto", () => {
    const r = leerVista({
      resaltar: {
        etiqueta: 3,
        texto: 7,
        vacantes: "si",
        sede: "",
        contrato: "k1",
        jornada: null,
        cargo: "c1",
      },
    });
    expect(r.resaltar).toEqual({ ...VISTA_POR_DEFECTO.resaltar, contrato: "k1", cargo: "c1" });
    expect(leerVista({ resaltar: "x" }).resaltar).toEqual(VISTA_POR_DEFECTO.resaltar);
    r.resaltar.sede = "mutada";
    expect(VISTA_POR_DEFECTO.resaltar.sede).toBeNull();
    expect(leerVista(null).resaltar).not.toBe(VISTA_POR_DEFECTO.resaltar);
  });

  it("colorearPor: acepta ninguno y marca:<tipo>, rechaza lo demás", () => {
    expect(leerVista({ colorearPor: "ninguno" }).colorearPor).toBe("ninguno");
    expect(leerVista({ colorearPor: "marca:" }).colorearPor).toBe("ninguno");
    expect(leerVista({ colorearPor: "otro:a" }).colorearPor).toBe("ninguno");
  });

  it("colorearPor: acepta la leyenda del puesto y no la confunde con una marca", () => {
    expect(CRITERIO_LEYENDA).toBe("leyenda");
    expect(leerVista({ colorearPor: "leyenda" }).colorearPor).toBe("leyenda");
    expect(leerVista({ colorearPor: "leyenda:x" }).colorearPor).toBe("ninguno");
  });
});

describe("tipoDeMarca", () => {
  const enUso = [{ id: "g" }, { id: "a" }];
  it("devuelve el tipo si está en uso", () => expect(tipoDeMarca("marca:g", enUso)).toBe("g"));
  it("null si no se colorea, el tipo ya no se usa o el criterio es otro", () => {
    expect(tipoDeMarca("ninguno", enUso)).toBeNull();
    expect(tipoDeMarca("marca:z", enUso)).toBeNull();
    expect(tipoDeMarca("leyenda", enUso)).toBeNull();
  });
});

describe("leyendasEnUso", () => {
  const ley = (id: string, nombre: string, orden: number, deleted_at: string | null = null): Leyenda => ({
    id,
    nombre,
    color: "#be123c",
    descripcion: null,
    orden,
    deleted_at,
  });
  const leyendas = [
    ley("a", "Crítico", 1),
    ley("b", "En sucesión", 2),
    ley("c", "Clave", 3),
    ley("d", "Antigua", 4, "x"),
  ];

  it("solo las entradas que usan los puestos dibujados, una vez y en el orden de la lista", () => {
    const puestos = [{ leyenda_id: "c" }, { leyenda_id: null }, { leyenda_id: "a" }, { leyenda_id: "c" }];
    expect(leyendasEnUso(puestos, leyendas).map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("incluye una entrada desactivada mientras algún puesto la use", () => {
    expect(leyendasEnUso([{ leyenda_id: "d" }], leyendas).map((l) => l.id)).toEqual(["d"]);
  });

  it("ignora una leyenda que no existe y no devuelve nada sin puestos", () => {
    expect(leyendasEnUso([{ leyenda_id: "zzz" }], leyendas)).toEqual([]);
    expect(leyendasEnUso([], leyendas)).toEqual([]);
  });
});

describe("opcionesElk y tamaños", () => {
  it("por defecto: árbol ordenado (mrtree) vertical, hermanos según su orden", () => {
    expect(opcionesElk(VISTA_POR_DEFECTO)).toEqual({
      "elk.algorithm": "mrtree",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "28",
      "elk.mrtree.weighting": "MODEL_ORDER",
    });
  });

  it("horizontal usa RIGHT y compacta reduce las separaciones", () => {
    const h = opcionesElk({ direccion: "horizontal", densidad: "normal" });
    const c = opcionesElk({ direccion: "vertical", densidad: "compacta" });
    expect(h["elk.direction"]).toBe("RIGHT");
    expect(h["elk.spacing.nodeNode"]).toBe("28");
    expect(c["elk.direction"]).toBe("DOWN");
    expect(Number(c["elk.spacing.nodeNode"])).toBeLessThan(28);
    expect(separaciones({ densidad: "normal" })).toEqual({ hermanos: 28, niveles: 64, puestos: 12 });
    expect(separaciones({ densidad: "compacta" }).niveles).toBeLessThan(64);
  });

  it("la tarjeta compacta es de una línea y no crece con la ruta; la normal crece", () => {
    expect(tamUnidad({ densidad: "normal", personasEnTarjetas: false }, false)).toEqual({ ancho: 220, alto: 112 });
    expect(tamUnidad({ densidad: "normal", personasEnTarjetas: false }, true)).toEqual({ ancho: 220, alto: 132 });
    expect(tamUnidad({ densidad: "compacta", personasEnTarjetas: true }, true)).toEqual(tamUnidad({ densidad: "compacta", personasEnTarjetas: true }, false));
    expect(tamUnidad({ densidad: "compacta", personasEnTarjetas: true }, false).alto).toBeLessThan(60);
    expect(tamPuesto({ densidad: "normal" })).toEqual({ ancho: 200, alto: 68 });
    expect(tamPuesto({ densidad: "compacta" }).alto).toBeLessThan(40);
  });

  it("«Personas en las tarjetas» suma la jefatura con cargo y la fila de caras; la compacta no cambia", () => {
    const con = { densidad: "normal", personasEnTarjetas: true } as const;
    expect(tamUnidad(con, false)).toEqual({ ancho: 220, alto: 152 });
    expect(tamUnidad(con, true)).toEqual({ ancho: 220, alto: 172 });
    expect(tamUnidad(VISTA_POR_DEFECTO, false)).toEqual(tamUnidad(con, false)); // activa por defecto
    expect(tamUnidad({ ...con, densidad: "compacta" }, false)).toEqual(
      tamUnidad({ densidad: "compacta", personasEnTarjetas: false }, false),
    );
  });

  it("el puesto de jefatura no se repite solo si la tarjeta muestra la jefatura", () => {
    expect(jefeEnTarjeta(VISTA_POR_DEFECTO)).toBe(true);
    expect(jefeEnTarjeta({ ...VISTA_POR_DEFECTO, personasEnTarjetas: false })).toBe(false);
    expect(jefeEnTarjeta({ ...VISTA_POR_DEFECTO, mostrarJefe: false })).toBe(false);
    expect(jefeEnTarjeta({ ...VISTA_POR_DEFECTO, densidad: "compacta" })).toBe(false); // la compacta no la muestra
    expect(jefeEnTarjeta({ ...VISTA_POR_DEFECTO, colorearPor: CRITERIO_LEYENDA })).toBe(false); // su color va en el puesto
  });

  it("las tarjetas crecen con la escala de la interfaz (el texto es rem): layout y tarjeta usan la misma medida", () => {
    expect(tamUnidad({ densidad: "normal", personasEnTarjetas: false }, false, 100)).toEqual({ ancho: 220, alto: 112 });
    expect(tamUnidad({ densidad: "normal", personasEnTarjetas: false }, false, 125)).toEqual({ ancho: 275, alto: 140 });
    expect(tamUnidad({ densidad: "compacta", personasEnTarjetas: true }, false, 125)).toEqual({ ancho: 275, alto: 50 });
    expect(tamUnidad({ densidad: "normal", personasEnTarjetas: false }, true, 90)).toEqual({ ancho: 198, alto: 119 });
    expect(tamPuesto({ densidad: "normal" }, 125)).toEqual({ ancho: 250, alto: 85 });
  });
});

describe("vistas guardadas: configuración", () => {
  const vivas = new Set(["a", "b", "c"]);
  const guardada = JSON.stringify(
    configDeVista(
      {
        ...VISTA_POR_DEFECTO,
        direccion: "horizontal",
        resaltar: { ...VISTA_POR_DEFECTO.resaltar, vacantes: true },
      },
      new Set(["a", "zzz"]),
    ),
  );

  it("aplica la configuración completa y descarta las ramas plegadas que ya no existen", () => {
    const r = aplicarVista(guardada, vivas);
    expect(r.vista.direccion).toBe("horizontal");
    expect(r.vista.resaltar.vacantes).toBe(true);
    expect(r.colapsados).toEqual(new Set(["a"]));
  });

  it("nunca lanza: JSON dañado o de otra forma da los valores por defecto sin tocar las ramas", () => {
    for (const malo of ["", "{", "null", "3", "[]", '"x"', "{}"]) {
      const r = aplicarVista(malo, vivas);
      expect(r.vista).toEqual(VISTA_POR_DEFECTO);
      expect(r.colapsados).toBeNull();
    }
  });

  it("ignora claves desconocidas y ids de ramas que no son texto", () => {
    const r = aplicarVista(
      JSON.stringify({ vista: { densidad: "compacta", otra: 1 }, colapsados: ["b", 4, null], x: 1 }),
      vivas,
    );
    expect(r.vista).toEqual({ ...VISTA_POR_DEFECTO, densidad: "compacta" });
    expect(r.colapsados).toEqual(new Set(["b"]));
  });

  it("sinResaltar limpia el resaltado y conserva el resto", () => {
    const c = leerVista({ densidad: "compacta", resaltar: { texto: "x", sede: "s" } });
    expect(sinResaltar(c)).toEqual({ ...c, resaltar: VISTA_POR_DEFECTO.resaltar });
    expect(c.resaltar.texto).toBe("x");
  });
});

describe("arbolDeVista", () => {
  const sub = [{ id: "s1", unidad_id: "u1" }];
  it("null sin raíz (árbol completo), el id del subárbol guardado o undefined si la rama no está guardada", () => {
    expect(arbolDeVista(null, sub)).toBeNull();
    expect(arbolDeVista("u1", sub)).toBe("s1");
    expect(arbolDeVista("u2", sub)).toBeUndefined();
  });
});

describe("tipoArista", () => {
  it("las curvas son el tipo «default» de Vue Flow; las rectas en ángulo, «smoothstep»", () => {
    expect(tipoArista("bezier")).toBe("default");
    expect(tipoArista("smoothstep")).toBe("smoothstep");
  });
});
