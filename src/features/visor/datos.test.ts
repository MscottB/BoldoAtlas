import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { datos } from "@/features/export/fixture";
import { contenidoImagen, type PedidoImagen } from "@/features/export/preparar";
import { useOrganizacion } from "@/stores/organizacion";
import { datosVisor } from "./datos";

beforeEach(() => {
  setActivePinia(createPinia());
  const d = datos();
  const org = useOrganizacion();
  org.$patch({
    unidades: d.unidades,
    puestos: d.puestos,
    asignaciones: d.asignaciones,
    trabajadores: [...d.trabajadores.values()],
    org: { nombre: "Atlas SA", logo: null },
    catalogos: { ...org.catalogos, cargos: [...d.cargos].map(([id, nombre]) => ({ id, nombre })) } as never,
    cargado: true,
  });
});

const pedido = (o: Partial<PedidoImagen> = {}): PedidoImagen => ({
  alcance: "todo",
  nivel: "presentacion",
  abrirTodo: false,
  config: VISTA_POR_DEFECTO,
  ...o,
});
const sin = { correo: false, telefono: false };

describe("datosVisor", () => {
  it("estructura_no_lleva_personas", () => {
    // El texto del resaltado del lienzo se compara con nombres: tampoco viaja.
    const config = { ...VISTA_POR_DEFECTO, resaltar: { ...VISTA_POR_DEFECTO.resaltar, texto: "Ximena" } };
    const json = JSON.stringify(
      datosVisor({ ...pedido({ nivel: "estructura", config }), correo: true, telefono: true }),
    );
    for (const x of ["Ximena", "Bruno", "Carla", "@correo.cl", "+56 9"]) expect(json).not.toContain(x);
    expect(json).toContain("Bodega");
    expect(json).toContain("Analista ZQX");
  });

  it("sin_casillas_no_lleva_contacto", () => {
    const json = JSON.stringify(datosVisor({ ...pedido(), ...sin }));
    expect(json).not.toContain("@correo.cl");
    expect(json).not.toContain("+56 9");

    const con = datosVisor({ ...pedido(), correo: true, telefono: true });
    expect(con.panel.g!.jefatura).toMatchObject({
      correo: "ZQX.w1@correo.cl",
      telefono: "+56 9 ZQX w1",
    });
    // Carla solo reemplaza: su contacto no sale.
    expect(JSON.stringify(con)).not.toContain("ZQX.w3@correo.cl");
    // Cada casilla por su lado.
    const soloCorreo = datosVisor({ ...pedido(), correo: true, telefono: false });
    expect(JSON.stringify(soloCorreo)).toContain("ZQX.w1@correo.cl");
    expect(JSON.stringify(soloCorreo)).not.toContain("+56 9");
  });

  it("rama_como_alcance", () => {
    const v = datosVisor({ ...pedido({ alcance: { rama: "a2" } }), ...sin });
    expect(v.unidades.map((x) => x.id).sort()).toEqual(["a2", "s1", "s2", "s3"]);
    expect(v.panel.s3!.ruta).toEqual(["Gerencia General", "Operaciones", "Logística", "Bodega"]);
  });

  it("rama_como_alcance_solo_lleva_sus_zonas", () => {
    useOrganizacion().$patch({
      zonas: [
        { id: "z1", nombre: "Zona Sur", color: "#2563eb" },
        { id: "z2", nombre: "Zona Fuera", color: "#16a34a" },
      ],
      zonaUnidades: [
        { zona_id: "z1", unidad_id: "s1" },
        { zona_id: "z1", unidad_id: "g" },
        { zona_id: "z2", unidad_id: "a1" },
      ],
    });
    const v = datosVisor({ ...pedido({ alcance: { rama: "a2" } }), ...sin });
    expect(v.zonas!.zonas.map((z) => z.id)).toEqual(["z1"]);
    expect(v.zonas!.zonaUnidades).toEqual([{ zona_id: "z1", unidad_id: "s1" }]);
    expect(JSON.stringify(v)).not.toContain("Zona Fuera");
  });

  it("plegadas_al_abrir", () => {
    const o = pedido();
    expect(datosVisor({ ...o, ...sin }).plegadas).toEqual([...contenidoImagen(o).plegadas]);
    expect(datosVisor({ ...o, abrirTodo: true, ...sin }).plegadas).toEqual([]);
    // Las tarjetas son las de todas las unidades, aunque se abra plegado.
    expect(
      datosVisor({ ...o, ...sin })
        .tarjetas.map((t) => t.id)
        .sort(),
    ).toEqual(["a1", "a2", "g", "s1", "s2", "s3"]);
  });

  it("pantalla_con_puestos_sin_casillas_no_lleva_contacto", () => {
    const config = { ...VISTA_POR_DEFECTO, verPuestos: true };
    const v = datosVisor({ ...pedido({ nivel: "pantalla", config }), ...sin });
    expect(v.tarjetas.some((t) => t.id === "p-x")).toBe(true);
    const json = JSON.stringify(v);
    expect(json).not.toContain("@correo.cl");
    expect(json).not.toContain("+56 9");
  });

  it("sin_descripciones", () => {
    const v = datosVisor({
      ...pedido({ nivel: "pantalla", config: { ...VISTA_POR_DEFECTO, verPuestos: true } }),
      ...sin,
    });
    expect(v.puestos.length).toBeGreaterThan(0);
    expect([...v.unidades, ...v.puestos].every((x) => x.descripcion === null)).toBe(true);
  });

  it("el_panel_separa_la_jefatura_y_marca_las_vacantes", () => {
    const v = datosVisor({ ...pedido(), ...sin });
    expect(v.panel.a1!.jefatura).toMatchObject({ nombre: expect.stringContaining("Bruno") });
    expect(v.panel.a1!.personas).toHaveLength(1);
    expect(v.panel.a1!.personas[0]).toMatchObject({
      cargo: "Analista ZQX",
      reemplazo: expect.stringContaining("Carla"),
    });
    expect(v.panel.a1!.personas[0]!.nombre).toBeUndefined();
    expect(v.panel.a2!.personas[0]!.nombre).toBeUndefined();
  });

  it("textos_del_visor", () => {
    const t = datosVisor({ ...pedido(), ...sin }).textos;
    expect(t["visor.plegar"]).toBe("Plegar la rama");
    expect(Object.keys(t)).toEqual(
      expect.arrayContaining(["imagen.masUnidades", "puesto.vacante", "puesto.reemplazoDe"]),
    );
  });
});
