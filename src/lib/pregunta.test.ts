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

  it("tomar cierra y deja lo preguntado para el diálogo que se anima al cerrar", () => {
    const p = usePregunta<string>();
    expect(p.tomar()).toBeNull();
    p.preguntar("salir");
    expect(p.tomar()).toBe("salir");
    expect([p.abierta.value, p.valor.value]).toEqual([false, "salir"]);
    expect(p.tomar()).toBeNull();
  });

  it("cancelar y volver a preguntar muestra y confirma lo nuevo", () => {
    const p = usePregunta<string>();
    p.preguntar("volver");
    p.cerrar();
    p.preguntar("salir");
    expect([p.abierta.value, p.valor.value]).toEqual([true, "salir"]);
    expect(p.tomar()).toBe("salir");
  });
});
