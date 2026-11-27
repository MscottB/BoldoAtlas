import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { datos } from "@/features/export/fixture";
import type { PedidoImagen } from "@/features/export/preparar";
import { contraste } from "@/features/tema/tema";
import { useOrganizacion } from "@/stores/organizacion";
import { datosVisor, type DatosVisor } from "../datos";
import { COLORES } from "./estilos";
import {
  abrirHasta,
  buscar,
  desplegar,
  filasDeLista,
  moverEnLista,
  plegar,
  enlaceCorreo,
  enlaceTelefono,
  logoSeguro,
  posicionEnHermanos,
  siguienteResultado,
} from "./estado";

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
  abrirTodo: true,
  config: VISTA_POR_DEFECTO,
  ...o,
});
const visor = (o: Partial<PedidoImagen> = {}): DatosVisor =>
  datosVisor({ ...pedido(o), correo: false, telefono: false });

describe("plegar y desplegar", () => {
  it("no cambian el conjunto de origen", () => {
    const p = new Set(["a2"]);
    expect([...plegar(p, "s1")]).toEqual(["a2", "s1"]);
    expect([...desplegar(p, "a2")]).toEqual([]);
    expect([...p]).toEqual(["a2"]);
  });

  it("abrir_hasta", () => {
    const d = visor();
    expect([...abrirHasta(new Set(["a2", "s1"]), d.unidades, "s3")]).toEqual([]);
    // a1 no está en la ruta de s3: sigue plegada.
    expect([...abrirHasta(new Set(["a1", "a2", "s1"]), d.unidades, "s3")]).toEqual(["a1"]);
    // La unidad buscada no se abre: solo sus superiores.
    expect([...abrirHasta(new Set(["s3", "a2"]), d.unidades, "s3")]).toEqual(["s3"]);
  });
});

describe("buscar", () => {
  it("buscar_sin_tildes", () => {
    expect(buscar(visor(), "logistica").map((r) => r.id)).toEqual(["s1"]);
    expect(buscar(visor({ nivel: "estructura" }), "ximena")).toEqual([]);
    const r = buscar(visor(), "ximena");
    expect(r.map((x) => x.id)).toEqual(["g"]);
    expect(r[0].titulo).toBe("Gerencia General");
    expect(r[0].detalle).toContain("Ximena");
  });

  it("encuentra cargos también en Estructura y respeta el orden del árbol", () => {
    expect(buscar(visor({ nivel: "estructura" }), "analista").map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(buscar(visor(), "  ")).toEqual([]);
    // s3 va antes que s2: es hija de s1.
    expect(buscar(visor(), "a").map((r) => r.id)).toEqual(["g", "a1", "a2", "s1", "s3", "s2"]);
  });

  it("devuelve a lo más 50", () => {
    const d = visor();
    d.unidades = Array.from({ length: 80 }, (_, i) => ({ ...d.unidades[0], id: `u${i}`, parent_id: null }));
    expect(buscar(d, "gerencia")).toHaveLength(50);
  });
});

describe("la lista", () => {
  const ids = (p: string[]) => filasDeLista(visor(), new Set(p)).map((f) => f.id);

  it("filas en orden de árbol, sin lo que está bajo una plegada", () => {
    expect(ids([])).toEqual(["g", "a1", "a2", "s1", "s3", "s2"]);
    expect(ids(["s1"])).toEqual(["g", "a1", "a2", "s1", "s2"]);
    const plegada = filasDeLista(visor(), new Set(["a2"]));
    expect(plegada[plegada.length - 1]).toEqual({
      id: "a2",
      nivel: 2,
      conRamas: true,
      abierta: false,
    });
    expect(filasDeLista(visor(), new Set()).find((f) => f.id === "s3")).toMatchObject({
      nivel: 4,
      conRamas: false,
      abierta: false,
    });
  });

  it("recorrido_de_la_lista", () => {
    const filas = (p: string[] = []) => filasDeLista(visor(), new Set(p));
    // ↓ salta lo que hay bajo una rama plegada.
    expect(moverEnLista(filas(["s1"]), "s1", "ArrowDown")).toEqual({ foco: "s2" });
    expect(moverEnLista(filas(["a2"]), "a1", "ArrowDown")).toEqual({ foco: "a2" });
    // a2 plegada es la última fila: ↓ se queda.
    expect(moverEnLista(filas(["a2"]), "a2", "ArrowDown")).toEqual({ foco: "a2" });
    expect(moverEnLista(filas(), "a2", "ArrowDown")).toEqual({ foco: "s1" });
    expect(moverEnLista(filas(), "g", "ArrowUp")).toEqual({ foco: "g" });
    // ← en una hoja sube a su superior; en una rama abierta la cierra.
    expect(moverEnLista(filas(), "s3", "ArrowLeft")).toEqual({ foco: "s1" });
    expect(moverEnLista(filas(), "s1", "ArrowLeft")).toEqual({ foco: "s1", cerrar: "s1" });
    expect(moverEnLista(filas(["s1"]), "s1", "ArrowLeft")).toEqual({ foco: "a2" });
    // → abre una cerrada, y en una abierta baja a su primera hija.
    expect(moverEnLista(filas(["s1"]), "s1", "ArrowRight")).toEqual({ foco: "s1", abrir: "s1" });
    expect(moverEnLista(filas(), "s1", "ArrowRight")).toEqual({ foco: "s3" });
    expect(moverEnLista(filas(), "s3", "ArrowRight")).toEqual({ foco: "s3" });
    expect(moverEnLista(filas(), "s1", "Home")).toEqual({ foco: "g" });
    expect(moverEnLista(filas(), "s1", "End")).toEqual({ foco: "s2" });
  });
});

describe("búsqueda con teclado", () => {
  it("siguienteResultado entra por los extremos y da la vuelta", () => {
    expect(siguienteResultado(-1, 3, true)).toBe(0);
    expect(siguienteResultado(-1, 3, false)).toBe(2);
    expect(siguienteResultado(0, 3, true)).toBe(1);
    expect(siguienteResultado(2, 3, true)).toBe(0);
    expect(siguienteResultado(0, 3, false)).toBe(2);
    expect(siguienteResultado(-1, 1, true)).toBe(0);
    expect(siguienteResultado(-1, 1, false)).toBe(0);
    expect(siguienteResultado(0, 1, true)).toBe(0);
    expect(siguienteResultado(0, 1, false)).toBe(0);
    expect(siguienteResultado(-1, 0, true)).toBe(-1);
  });
});

describe("enlaces del panel", () => {
  it("correo: la @ queda y lo demás se codifica", () => {
    expect(enlaceCorreo("ZQX.w1@correo.cl")).toBe("mailto:ZQX.w1@correo.cl");
    expect(enlaceCorreo("a@b.cl?cc=x@y")).toBe("mailto:a@b.cl%3Fcc%3Dx@y");
    expect(enlaceCorreo("a@b.cl&body=hola")).not.toContain("&");
  });
  it("teléfono: solo dígitos y un + al comienzo", () => {
    expect(enlaceTelefono("+56 9 1111 2222")).toBe("tel:+56911112222");
    expect(enlaceTelefono("(2) 2345-6789")).toBe("tel:223456789");
    expect(enlaceTelefono("sin número")).toBeNull();
  });
});

describe("posición entre hermanos", () => {
  it("cuenta las filas con el mismo superior", () => {
    const filas = filasDeLista(visor(), new Set());
    // g, a1, a2, s1, s3, s2
    expect(posicionEnHermanos(filas)).toEqual([
      { tam: 1, pos: 1 },
      { tam: 2, pos: 1 },
      { tam: 2, pos: 2 },
      { tam: 2, pos: 1 },
      { tam: 1, pos: 1 },
      { tam: 2, pos: 2 },
    ]);
  });
});

describe("colores del visor", () => {
  it("el texto y los bordes cumplen AA", () => {
    const { fondo, barra, texto, apagado, borde, acento, sobreAcento, seleccion } = COLORES;
    for (const [a, b] of [
      [texto, fondo],
      [texto, barra],
      [apagado, fondo],
      [apagado, barra],
      [acento, fondo],
      [acento, barra],
      [sobreAcento, acento],
      [texto, seleccion],
    ])
      expect(contraste(a, b)).toBeGreaterThanOrEqual(4.5);
    // Bordes de controles y foco: 3:1.
    for (const f of [fondo, barra]) {
      expect(contraste(borde, f)).toBeGreaterThanOrEqual(3);
      expect(contraste(acento, f)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("logoSeguro", () => {
  it("solo una imagen en data:; lo demás no se usa", () => {
    expect(logoSeguro("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    for (const x of [
      undefined,
      null,
      "",
      "https://x.cl/logo.png",
      "javascript:alert(1)",
      "data:text/html,<b>",
      " data:image/png,",
    ])
      expect(logoSeguro(x), String(x)).toBeUndefined();
  });
});
