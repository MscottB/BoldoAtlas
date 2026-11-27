import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import programa from "virtual:visor-programa";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { datos } from "@/features/export/fixture";
import type { PedidoImagen } from "@/features/export/preparar";
import { useOrganizacion } from "@/stores/organizacion";
import { datosVisor, type DatosVisor } from "./datos";
import { armarHtml, leerDatos } from "./html";
import { ESTILOS } from "./programa/estilos";

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
const huella = (t: string) => `'sha256-${createHash("sha256").update(t).digest("base64")}'`;

describe("armarHtml", () => {
  it("textos_peligrosos_quedan_escapados", async () => {
    const d: DatosVisor = datosVisor({ ...pedido(), ...sin });
    d.unidades[0].nombre = `</script><img src=x onerror="window.x=1">`;
    d.zonas = { zonas: [{ id: "z", nombre: "<!-- a", color: "#aabbcc" }], zonaUnidades: [] };
    d.encabezado.organizacion = `"&'`;
    d.conexiones = [
      { id: "c", origen_id: "a1", destino_id: "a2", etiqueta: "uno" + String.fromCharCode(0x2028) + "dos" },
    ];
    const html = await armarHtml(d, programa);
    for (const x of ["</script><img", 'onerror="window', "<!-- a", String.fromCharCode(0x2028), `"&'`])
      expect(html).not.toContain(x);
    expect(leerDatos(html)).toEqual(d);
  });

  it("html_de_estructura_sin_personas", async () => {
    const html = await armarHtml(datosVisor({ ...pedido({ nivel: "estructura" }), ...sin }), programa);
    for (const x of ["Ximena", "Bruno", "Carla"]) expect(html).not.toContain(x);
  });

  it("csp_con_huellas", async () => {
    const html = await armarHtml(datosVisor({ ...pedido(), ...sin }), programa);
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)![1];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src ${huella(programa)}`);
    expect(csp).toContain(`style-src ${huella(ESTILOS)}`);
    expect(/<script>([\s\S]*?)<\/script>/.exec(html)![1]).toBe(programa);
    expect(/<style>([\s\S]*?)<\/style>/.exec(html)![1]).toBe(ESTILOS);
  });

  it("programa_seguro", async () => {
    expect(programa).not.toContain("</script");
    expect(programa).not.toContain("<!--");
    await expect(armarHtml(datosVisor({ ...pedido(), ...sin }), "a</script>b")).rejects.toThrow();
  });

  it("programa_sin_vue", () => {
    expect(programa).not.toContain("createApp");
    expect(programa.length).toBeLessThan(2.5 * 1024 * 1024);
  });

  // Para abrirlo a mano en un navegador: BOLDO_VISOR_SALIDA=<carpeta> npx vitest run src/features/visor/html.test.ts
  it.skipIf(!process.env.BOLDO_VISOR_SALIDA)("escribe_el_visor_del_fixture", async () => {
    const dir = process.env.BOLDO_VISOR_SALIDA!;
    mkdirSync(dir, { recursive: true });
    for (const nivel of ["estructura", "presentacion", "pantalla"] as const)
      writeFileSync(
        join(dir, `visor-${nivel}.html`),
        await armarHtml(datosVisor({ ...pedido({ nivel }), correo: true, telefono: true }), programa),
      );
  });
});
