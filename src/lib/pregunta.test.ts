import { describe, expect, it } from "vitest";
import { usePregunta } from "./pregunta";

describe("usePregunta", () => {
  it("el cierre llega antes del clic de confirmar: lo preguntado sigue ahí para confirmarlo una vez", () => {
    const p = usePregunta<{ n: number }>();
    const pedido = { n: 2 };
    p.preguntar(pedido);
    expect(p.abierta.value).toBe(true);
    // el orden de reka: primero el cierre (DialogClose), después el clic de quien confirma
    p.cerrar();
    expect(p.abierta.value).toBe(false);
    expect(p.tomar()).toBe(pedido);
    expect(p.tomar()).toBeNull();
  });

  it("tomar también cierra", () => {
    const p = usePregunta<string>();
    p.preguntar("salir");
    expect(p.tomar()).toBe("salir");
    expect([p.abierta.value, p.valor.value]).toEqual([false, null]);
  });
});
