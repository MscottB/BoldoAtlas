import { afterEach, describe, expect, it, vi } from "vitest";
import { armarPdf } from "./armarPdf";
import type { TextosManual } from "./manual";
import type { OpcionesManual } from "./manualPdf";
import type { OpcionesPdf } from "./pdf";

// Un worker de mentira que nunca responde: así se ve qué hace armarPdf al cancelar.
const w = vi.hoisted(() => ({ creados: [] as { terminado: boolean; pedidos: unknown[] }[] }));
vi.mock("./pdf.worker?worker", () => ({
  default: class {
    terminado = false;
    pedidos: unknown[] = [];
    onmessage: unknown = null;
    onerror: unknown = null;
    onmessageerror: unknown = null;
    constructor() {
      w.creados.push(this);
    }
    postMessage(m: unknown) {
      this.pedidos.push(m);
    }
    terminate() {
      this.terminado = true;
    }
  },
}));

const o: OpcionesPdf = {
  hoja: "carta",
  orientacion: "horizontal",
  encabezado: { organizacion: "A", alcance: "B", fecha: "C", logo: null },
  pagina: "{n}/{m}",
  titulo: "Organigrama",
};
const manual: OpcionesManual = {
  ...o,
  conPersonas: false,
  textos: {} as TextosManual,
  portada: { version: "D", revision: "E" },
};
const svg = "<svg/>";
afterEach(() => void (w.creados.length = 0));

describe("armarPdf", () => {
  it("manda las páginas tal cual al worker", () => {
    const pedido = { tipo: "organigrama" as const, paginas: [{ svg, ancho: 1, alto: 1 }], o };
    void armarPdf(pedido, () => {});
    expect(w.creados[0]!.pedidos[0]).toEqual(pedido);
  });

  it("manda el manual tal cual al worker", () => {
    const datos = { unidades: [], general: [], dibujos: new Map([["u", { svg, ancho: 1, alto: 1 }]]) };
    const pedido = { tipo: "manual" as const, datos, o: manual };
    void armarPdf(pedido, () => {});
    expect(w.creados[0]!.pedidos[0]).toEqual(pedido);
  });

  it("al cancelar cierra el worker y rechaza con AbortError", async () => {
    const c = new AbortController();
    const pdf = armarPdf(
      { tipo: "organigrama", paginas: [{ svg, ancho: 1, alto: 1 }], o },
      () => {},
      c.signal,
    );
    c.abort();
    await expect(pdf).rejects.toMatchObject({ name: "AbortError" });
    expect(w.creados[0]!.terminado).toBe(true);
  });

  it("con la señal ya cancelada ni crea el worker", async () => {
    const c = new AbortController();
    c.abort();
    await expect(armarPdf({ tipo: "organigrama", paginas: [], o }, () => {}, c.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
    expect(w.creados).toHaveLength(0);
  });
});
