import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { DEMORA_ABRIR, DEMORA_CERRAR, guardarAbrirAlPasar, useBarraFlotante } from "./barraLateral";

function barra(contraida = true) {
  const colapsada = ref(contraida);
  const scope = effectScope();
  const b = scope.run(() => useBarraFlotante(colapsada))!;
  return { ...b, colapsada, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
  guardarAbrirAlPasar(true);
});
afterEach(() => vi.useRealTimers());

describe("barra lateral flotante", () => {
  it("con el mouse se abre tras la demora y se cierra un rato después de salir", () => {
    const b = barra();
    b.entrar();
    vi.advanceTimersByTime(DEMORA_ABRIR - 1);
    expect(b.flotando.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(b.flotando.value).toBe(true);
    b.salir();
    vi.advanceTimersByTime(DEMORA_CERRAR - 1);
    expect(b.flotando.value).toBe(true);
    b.entrar(); // volver antes de que se cierre la deja abierta
    vi.advanceTimersByTime(DEMORA_CERRAR);
    expect(b.flotando.value).toBe(true);
    b.salir();
    vi.advanceTimersByTime(DEMORA_CERRAR);
    expect(b.flotando.value).toBe(false);
  });

  it("cruzarla de paso no la abre", () => {
    const b = barra();
    b.entrar();
    vi.advanceTimersByTime(DEMORA_ABRIR / 2);
    b.salir();
    vi.advanceTimersByTime(DEMORA_ABRIR + DEMORA_CERRAR);
    expect(b.flotando.value).toBe(false);
  });

  it("con el teclado se abre al entrar el foco y Esc la cierra", () => {
    const b = barra();
    b.enfocar();
    expect(b.flotando.value).toBe(true);
    b.cerrar();
    expect(b.flotando.value).toBe(false);
  });

  it("no se despliega si está fija abierta o si la opción está apagada; fijarla termina el despliegue", async () => {
    const abierta = barra(false);
    abierta.entrar();
    abierta.enfocar();
    vi.advanceTimersByTime(DEMORA_ABRIR);
    expect(abierta.flotando.value).toBe(false);

    const b = barra();
    b.enfocar();
    b.colapsada.value = false;
    await nextTick();
    expect(b.flotando.value).toBe(false);

    guardarAbrirAlPasar(false);
    const apagada = barra();
    apagada.entrar();
    apagada.enfocar();
    vi.advanceTimersByTime(DEMORA_ABRIR);
    expect(apagada.flotando.value).toBe(false);
  });
});
