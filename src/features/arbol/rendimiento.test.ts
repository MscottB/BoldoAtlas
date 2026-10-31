import { describe, expect, it } from "vitest";
import { unidades } from "./fixture";
import { subgrafoVisible } from "./layout";
import {
  LIMITE_TARJETAS,
  MUCHAS_TARJETAS,
  ZOOM_DETALLE,
  colaDeUltimo,
  conMinimapa,
  debeAvisar,
  hastaNivel,
  nivelBajoLimite,
  tarjetasLigeras,
} from "./rendimiento";

describe("nivel de detalle del lienzo", () => {
  it("tarjetas ligeras solo alejado y con muchas tarjetas", () => {
    expect(tarjetasLigeras(ZOOM_DETALLE - 0.01, MUCHAS_TARJETAS + 1)).toBe(true);
    expect(tarjetasLigeras(ZOOM_DETALLE, MUCHAS_TARJETAS + 1)).toBe(false); // a ese zoom ya se lee
    expect(tarjetasLigeras(0.05, MUCHAS_TARJETAS)).toBe(false); // pocas tarjetas: siempre el detalle
  });

  it("el minimapa se oculta con muchas tarjetas", () => {
    expect(conMinimapa(MUCHAS_TARJETAS)).toBe(true);
    expect(conMinimapa(MUCHAS_TARJETAS + 1)).toBe(false);
  });
});

describe("límite al expandir", () => {
  // fixture: GG › (Operaciones › Mantención › Mecánica/Eléctrica), Finanzas → por nivel se ven 1, 3, 4 y 6 unidades.
  const contar = (c: Set<string>) => subgrafoVisible(unidades, [], c).nodos.length;

  it("avisa solo si quedan más tarjetas que el límite y más que antes", () => {
    expect(debeAvisar(10, LIMITE_TARJETAS + 1)).toBe(true);
    expect(debeAvisar(10, LIMITE_TARJETAS)).toBe(false);
    expect(debeAvisar(LIMITE_TARJETAS + 5, LIMITE_TARJETAS + 1)).toBe(false); // contraer no avisa
  });

  it("hastaNivel deja plegado lo que la acción abriría bajo el nivel, sin tocar lo ya abierto", () => {
    const actual = new Set(["operaciones", "mantencion"]); // se ven GG, Operaciones y Finanzas
    expect(hastaNivel(unidades, actual, new Set(), 3)).toEqual(new Set(["mantencion"]));
    expect(hastaNivel(unidades, actual, new Set(), 2)).toEqual(new Set(["operaciones", "mantencion"]));
    // Mantención ya estaba abierta: limitar a 2 niveles solo vuelve a plegar Operaciones, que la acción abría.
    expect(hastaNivel(unidades, new Set(["operaciones"]), new Set(), 2)).toEqual(new Set(["operaciones"]));
  });

  it("nivelBajoLimite da el mayor nivel que cabe, o null si ni el primero cabe", () => {
    const actual = new Set(["gg", "operaciones", "mantencion"]); // solo GG
    expect(nivelBajoLimite(unidades, actual, new Set(), contar, 5)).toBe(3); // 4 unidades; con el 4 serían 6
    expect(nivelBajoLimite(unidades, actual, new Set(), contar, 3)).toBe(2);
    expect(nivelBajoLimite(unidades, actual, new Set(), contar, 0)).toBeNull();
  });
});

describe("pedidos de layout al worker", () => {
  function preparar() {
    const enviados: [number, string][] = [];
    const cola = colaDeUltimo<string, string>((id, datos) => enviados.push([id, datos]));
    return { enviados, cola };
  }

  it("un pedido a la vez; mientras corre, solo el último espera y los reemplazados dan null", async () => {
    const { enviados, cola } = preparar();
    const a = cola.pedir("a");
    const b = cola.pedir("b");
    const c = cola.pedir("c");
    expect(enviados).toEqual([[1, "a"]]);
    expect(await b).toBeNull(); // reemplazado por c antes de salir
    cola.recibir(1, "A");
    expect(await a).toBeNull(); // llegó, pero ya hay uno más nuevo
    expect(enviados).toEqual([
      [1, "a"],
      [3, "c"],
    ]);
    cola.recibir(99, "X"); // un id desconocido no hace nada
    cola.recibir(3, "C");
    expect(await c).toBe("C");
  });

  it("un error del worker rechaza el pedido y deja pasar al siguiente", async () => {
    const { enviados, cola } = preparar();
    const a = cola.pedir("a");
    cola.recibir(1, undefined, "falló");
    await expect(a).rejects.toBe("falló");
    const b = cola.pedir("b");
    expect(enviados[enviados.length - 1]).toEqual([2, "b"]);
    cola.recibir(2, "B");
    expect(await b).toBe("B");
  });
});
