import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listarRespaldos = vi.hoisted(() => vi.fn());
const respaldarAhora = vi.hoisted(() => vi.fn());
vi.mock("@/db/cliente", () => ({ listarRespaldos, respaldarAhora }));
vi.mock("vue-sonner", () => ({ toast: vi.fn() }));

const REVISION = 15 * 60_000;
const HORA = 3_600_000;
let frecuencia: string;

/** Módulo nuevo en cada prueba: el temporizador y la espera tras un fallo son de la sesión. */
async function iniciar(ultimoHaceHoras: number) {
  const fecha = new Date(Date.now() - ultimoHaceHoras * HORA);
  listarRespaldos.mockResolvedValue([{ fecha: fecha.toISOString(), legible: true }]);
  vi.resetModules();
  const { iniciarRespaldoAutomatico } = await import("./respaldos");
  const { trabajos } = await import("@/lib/trabajos");
  iniciarRespaldoAutomatico();
  await vi.advanceTimersByTimeAsync(0);
  return { trabajos };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0));
  frecuencia = "24h";
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify(frecuencia),
    setItem: () => {},
  });
  listarRespaldos.mockReset();
  respaldarAhora.mockReset();
  respaldarAhora.mockResolvedValue("boldo.db");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("respaldo automático con la app abierta", () => {
  it("respalda cuando se cumple el plazo, también sin volver a abrir la app", async () => {
    await iniciar(23.9);
    expect(respaldarAhora).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(REVISION);
    expect(respaldarAhora).toHaveBeenCalledTimes(1);
  });

  it("«Cada vez» respalda al abrir y no en cada revisión", async () => {
    frecuencia = "abrir";
    await iniciar(1);
    expect(respaldarAhora).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REVISION * 8);
    expect(respaldarAhora).toHaveBeenCalledTimes(1);
  });

  it("«Nunca» no respalda", async () => {
    frecuencia = "nunca";
    await iniciar(100);
    await vi.advanceTimersByTimeAsync(REVISION * 8);
    expect(respaldarAhora).not.toHaveBeenCalled();
  });

  it("tras un fallo no reintenta en cada revisión: espera un día", async () => {
    respaldarAhora.mockRejectedValue({ codigo: "fallo", detalle: "disco lleno" });
    await iniciar(25);
    expect(respaldarAhora).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(23 * HORA);
    expect(respaldarAhora).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HORA + REVISION);
    expect(respaldarAhora).toHaveBeenCalledTimes(2);
  });

  it("con otro trabajo en curso espera a la revisión siguiente", async () => {
    const { trabajos } = await iniciar(23.9);
    trabajos.value.push("Otro");
    await vi.advanceTimersByTimeAsync(REVISION * 2);
    expect(listarRespaldos).toHaveBeenCalledTimes(1);
    trabajos.value.pop();
    await vi.advanceTimersByTimeAsync(REVISION);
    expect(respaldarAhora).toHaveBeenCalledTimes(1);
  });

  it("cuenta como trabajo en curso", async () => {
    let fin: (archivo: string) => void = () => {};
    respaldarAhora.mockReturnValue(new Promise<string>((r) => (fin = r)));
    const { trabajos } = await iniciar(25);
    expect(trabajos.value).toEqual(["Respaldo de los datos"]);
    fin("boldo.db");
    await vi.advanceTimersByTimeAsync(0);
    expect(trabajos.value).toEqual([]);
  });
});
