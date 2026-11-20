import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";

const db = vi.hoisted(() => ({
  fotosPendientes: vi.fn(),
  fotosHay: vi.fn(),
  fotosQuitar: vi.fn(),
  fotosQuitarTodas: vi.fn(),
}));
vi.mock("@/db/cliente", async (original) => ({ ...(await original<object>()), ...db }));
// El avance que manda Rust: la prueba lo emite con `avisar`.
const evento = vi.hoisted(() => ({
  avisar: (() => {}) as (payload: { hechos: number; total: number }) => void,
  soltado: false,
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: evento.listen }));

const nada = { organizaciones: [], respaldos: 0 };
const t = i18n.global.t;
// El estado del aviso vive en el módulo (la sesión): cada prueba parte de uno nuevo.
let m: typeof import("./aviso");

beforeEach(async () => {
  vi.resetModules();
  m = await import("./aviso");
  (await import("@/lib/baseActiva")).fijarBase("A");
  (await import("@/i18n")).i18n.global.locale.value = "es";
  db.fotosPendientes.mockReset().mockResolvedValue(nada);
  db.fotosHay.mockReset().mockResolvedValue(false);
  db.fotosQuitar.mockReset().mockResolvedValue(2);
  db.fotosQuitarTodas.mockReset().mockResolvedValue({ quitadas: 5, fallos: 0 });
  evento.soltado = false;
  evento.listen.mockReset().mockImplementation(async (_: string, f: (e: { payload: unknown }) => void) => {
    evento.avisar = (payload) => f({ payload });
    return () => (evento.soltado = true);
  });
});

const pendiente = <T>() => {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => (resolver = r));
  return { promesa, resolver };
};

describe("debeAvisar", () => {
  it("es falso sin pendientes, verdadero con alguno y falso si ya se avisó", () => {
    expect(m.debeAvisar(nada, false)).toBe(false);
    expect(m.debeAvisar({ organizaciones: ["Norte"], respaldos: 0 }, false)).toBe(true);
    expect(m.debeAvisar({ organizaciones: [], respaldos: 1 }, false)).toBe(true);
    expect(m.debeAvisar({ organizaciones: ["Norte"], respaldos: 3 }, true)).toBe(false);
  });
});

describe("textoAviso", () => {
  it("lleva los nombres y el conteo", () => {
    const s = m.textoAviso({ organizaciones: ["Norte", "Sur"], respaldos: 5 }, t);
    expect(s).toContain("Tienes fotos en «Norte», «Sur» y 5 respaldos.");
    expect(s).toContain("exporta antes cada organización a un .boldo");
    expect(m.textoAviso({ organizaciones: ["Norte"], respaldos: 1 }, t)).toContain("«Norte» y 1 respaldo.");
    expect(m.textoAviso({ organizaciones: [], respaldos: 2 }, t)).toContain("Tienes fotos en 2 respaldos.");
  });
});

describe("El aviso", () => {
  it("aviso_no_se_repite_en_la_sesion", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 2 });
    await m.revisarAlArrancar();
    expect(m.aviso.value?.externa).toBe(false);
    await m.masTarde();
    expect(m.aviso.value).toBeNull();
    await m.revisarAlArrancar();
    expect(m.aviso.value).toBeNull();
  });

  it("no avisa mientras limpia", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 2 });
    db.fotosHay.mockResolvedValue(true);
    m.quitando.value = { hechos: 1, total: 3 };
    await m.revisarAlArrancar();
    await m.revisarExterna("X", "Externa");
    expect(m.aviso.value).toBeNull();
  });

  it("un archivo externo con fotos avisa solo por él, y quitarlas no toca lo demás", async () => {
    db.fotosHay.mockResolvedValue(true);
    m.conocerAbierta(() => ({ nombre: "Externa", externa: true }));
    await m.revisarAlArrancar();
    expect(m.aviso.value).toMatchObject({ externa: true });
    expect(m.aviso.value?.texto).toContain("Tienes fotos en «Externa».");
    expect(await m.quitarAhora()).toEqual({ quitadas: 2, fallos: 0 });
    expect(db.fotosQuitar).toHaveBeenCalledOnce();
    expect(db.fotosQuitarTodas).not.toHaveBeenCalled();
    expect(m.aviso.value).toBeNull();
  });

  it("la limpieza general sigue fotos-avance, dice cuántos fallaron y termina sin limpieza en curso", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 2 });
    const fin = pendiente<{ quitadas: number; fallos: number }>();
    db.fotosQuitarTodas.mockReturnValue(fin.promesa);
    await m.revisarAlArrancar();
    const hecho = m.quitarAhora();
    expect(m.aviso.value).toBeNull();
    await vi.waitFor(() => expect(db.fotosQuitarTodas).toHaveBeenCalledWith(expect.any(String)));
    expect(evento.listen).toHaveBeenCalledWith("fotos-avance", expect.any(Function));
    evento.avisar({ hechos: 2, total: 3 });
    expect(m.quitando.value).toEqual({ hechos: 2, total: 3 });
    fin.resolver({ quitadas: 7, fallos: 1 });
    expect(await hecho).toEqual({ quitadas: 7, fallos: 1 });
    expect(m.quitando.value).toBeNull();
    expect(evento.soltado).toBe(true);
    expect(db.fotosQuitar).not.toHaveBeenCalled();
  });

  it("si la limpieza general falla, suelta fotos-avance y deja de limpiar", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 0 });
    db.fotosQuitarTodas.mockRejectedValue(new Error("boom"));
    await m.revisarAlArrancar();
    await expect(m.quitarAhora()).rejects.toThrow("boom");
    expect(m.quitando.value).toBeNull();
    expect(evento.soltado).toBe(true);
  });

  it("si la limpieza falla, el aviso que esperaba sale igual", async () => {
    const lectura = pendiente<{ organizaciones: string[]; respaldos: number }>();
    db.fotosPendientes.mockReturnValue(lectura.promesa);
    db.fotosHay.mockResolvedValue(true);
    db.fotosQuitar.mockRejectedValue(new Error("boom"));
    const arranque = m.revisarAlArrancar();
    await m.revisarExterna("A", "Externa");
    lectura.resolver({ organizaciones: ["Norte"], respaldos: 1 });
    await arranque;
    await expect(m.quitarAhora()).rejects.toThrow("boom");
    expect(m.quitando.value).toBeNull();
    expect(m.aviso.value).toMatchObject({ externa: false });
  });

  it("el aviso de un externo que espera a fotosHay mientras sale el general no se pierde", async () => {
    const hay = pendiente<boolean>();
    db.fotosHay.mockReturnValue(hay.promesa);
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 0 });
    const externa = m.revisarExterna("A", "Externa");
    await m.revisarAlArrancar();
    expect(m.aviso.value).toMatchObject({ externa: false });
    hay.resolver(true);
    await externa;
    expect(m.aviso.value).toMatchObject({ externa: false });
    await m.masTarde();
    expect(m.aviso.value).toMatchObject({ externa: true, baseId: "A" });
  });

  it("si otro trabajo ocupa la sesión, la limpieza general no da error y no quita nada", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 0 });
    db.fotosQuitarTodas.mockRejectedValue({ codigo: "trabajo_en_curso", detalle: "" });
    await m.revisarAlArrancar();
    expect(await m.quitarAhora()).toBeNull();
    expect(m.quitando.value).toBeNull();
    expect(m.aviso.value).toBeNull();
    expect(evento.soltado).toBe(true);
  });

  it("tras la limpieza general, la abierta externa con fotos recibe su propio aviso", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 0 });
    m.conocerAbierta(() => ({ nombre: "Externa", externa: true }));
    await m.revisarAlArrancar();
    expect(m.aviso.value?.externa).toBe(false);
    db.fotosHay.mockResolvedValue(true);
    await m.quitarAhora();
    expect(m.aviso.value).toMatchObject({ externa: true, baseId: "A" });
    expect(m.aviso.value?.texto).toContain("«Externa»");
  });

  it("con «Más tarde» en el general, se pregunta enseguida por la abierta si es externa; por una propia no", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 0 });
    db.fotosHay.mockResolvedValue(true);
    let externa = false;
    m.conocerAbierta(() => ({ nombre: "Externa", externa }));
    await m.revisarAlArrancar();
    await m.masTarde();
    expect(m.aviso.value).toBeNull();
    expect(db.fotosHay).not.toHaveBeenCalled();

    vi.resetModules();
    m = await import("./aviso");
    (await import("@/lib/baseActiva")).fijarBase("A");
    externa = true;
    m.conocerAbierta(() => ({ nombre: "Externa", externa }));
    await m.revisarAlArrancar();
    await m.masTarde();
    expect(m.aviso.value).toMatchObject({ externa: true });
  });

  it("si un externo avisa mientras se leen los pendientes, el general sale cuando ese se cierra", async () => {
    const lectura = pendiente<{ organizaciones: string[]; respaldos: number }>();
    db.fotosPendientes.mockReturnValue(lectura.promesa);
    db.fotosHay.mockResolvedValue(true);
    const arranque = m.revisarAlArrancar();
    await m.revisarExterna("X", "Externa");
    expect(m.aviso.value?.externa).toBe(true);
    lectura.resolver({ organizaciones: ["Norte"], respaldos: 1 });
    await arranque;
    expect(m.aviso.value?.externa).toBe(true);
    await m.masTarde();
    expect(m.aviso.value).toMatchObject({ externa: false });
    expect(m.aviso.value?.texto).toContain("«Norte» y 1 respaldo.");
  });
});
