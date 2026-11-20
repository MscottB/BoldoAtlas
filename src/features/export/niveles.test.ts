import { describe, expect, it } from "vitest";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { COLOR_MARCA, MARCA, armarSvg, datos, entrada } from "./fixture";
import { tarjetasDe } from "./niveles";

describe("tarjetasDe", () => {
  it("estructura_sin_datos_de_personas", async () => {
    const tarjetas = tarjetasDe("estructura", entrada(datos()));
    expect(tarjetas.map((t) => t.titulo)).toEqual(["Gerencia General", "Finanzas", "Operaciones"]);
    expect(tarjetas.every((t) => !t.lineas.length && t.color === null)).toBe(true);
    const { svg } = await armarSvg("estructura");
    // Nombres, correos, teléfonos, cargos, etiquetas, la leyenda y el color de la marca llevan la marca.
    for (const texto of [JSON.stringify(tarjetas), svg]) expect(texto).not.toContain(MARCA);
    expect(svg).not.toContain("XQ"); // iniciales de la jefa
    expect(svg).not.toContain(COLOR_MARCA);
    expect(svg).not.toContain("#123456");
    expect(svg).not.toMatch(/Dotación|vacante/i);
    // Sí lleva la estructura: unidades, zonas y conexiones laterales.
    expect(svg).toContain("Finanzas");
    expect(svg).toContain("Zona Norte");
    expect(svg).toContain("Coordina");
  });

  it("estructura_sin_datos_aunque_vengan_puestos_en_el_grafo", async () => {
    // Con «Ver puestos», con la jefatura en la tarjeta o como puesto aparte (coloreando por leyenda).
    const configs = [
      { ...VISTA_POR_DEFECTO, verPuestos: true },
      { ...VISTA_POR_DEFECTO, verPuestos: true, colorearPor: "leyenda" },
    ];
    for (const config of configs) {
      const { svg } = await armarSvg("estructura", { config, conPuestos: true });
      expect(svg).not.toContain(MARCA);
      // Solo las tres tarjetas de unidades y sus dos líneas jerárquicas: nada de los puestos.
      expect(svg.match(/<rect [^>]*rx="8"/g)).toHaveLength(3);
      expect(svg.match(/stroke="#a3a3a3"/g)).toHaveLength(2);
    }
  });

  it("presentacion_lleva_jefatura_o_vacante", () => {
    const porId = new Map(tarjetasDe("presentacion", entrada(datos())).map((t) => [t.id, t]));
    expect(porId.get("g")).toMatchObject({
      lineas: [`Ximena Quiroga ${MARCA}`, `Gerente ${MARCA}`],
      color: null,
    });
    expect(porId.get("a2")).toMatchObject({ lineas: ["Vacante"], vacante: true });
    // Sin dotación ni etiquetas.
    expect(JSON.stringify([...porId.values()])).not.toMatch(/Dotación|Clave/);
  });

  it("pantalla_sigue_la_config", () => {
    const g = (c = VISTA_POR_DEFECTO) =>
      tarjetasDe("pantalla", entrada(datos(), c)).find((t) => t.id === "g")!;
    expect(g().lineas.join("|")).toContain("Dotación total: 2");
    expect(g().lineas.join("|")).toContain("XQ"); // iniciales de la jefatura
    expect(g().color).toBe(COLOR_MARCA);
    expect(g().lineas.join("|")).toContain(`${MARCA}1`); // el código de la marca
    const sin = g({ ...VISTA_POR_DEFECTO, mostrarDotacion: false, mostrarFoto: false });
    expect(sin.lineas.join("|")).not.toContain("Dotación");
    expect(sin.lineas.join("|")).not.toContain("XQ");
    // Con «Ver puestos», también sus tarjetas; el reemplazo se nombra.
    const conPuestos = tarjetasDe("pantalla", entrada(datos(), { ...VISTA_POR_DEFECTO, verPuestos: true }));
    expect(conPuestos.find((t) => t.id === "p-x")).toMatchObject({
      titulo: `Analista ${MARCA}`,
      lineas: ["Vacante", `Reemplazo: Carla ${MARCA}`],
    });
  });

  it("rama_plegada_lleva_mas_n", async () => {
    for (const nivel of ["estructura", "presentacion", "pantalla"] as const) {
      const tarjetas = tarjetasDe(nivel, entrada(datos()));
      expect(tarjetas.find((t) => t.id === "a2")!.mas).toBe(3);
      expect(tarjetas.find((t) => t.id === "a1")!.mas).toBe(0);
      expect((await armarSvg(nivel)).svg).toContain("+3 unidades");
    }
  });
});
