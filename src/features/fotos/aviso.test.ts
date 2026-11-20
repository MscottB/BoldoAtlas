import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";

const db = vi.hoisted(() => ({
  fotosPendientes: vi.fn(),
  fotosHay: vi.fn(),
  fotosQuitar: vi.fn(async () => 2),
  fotosQuitarTodas: vi.fn(async () => 5),
}));
vi.mock("@/db/cliente", async (original) => ({ ...(await original<object>()), ...db }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const { aviso, debeAvisar, masTarde, quitarAhora, revisarAlArrancar, textoAviso } = await import("./aviso");

const nada = { organizaciones: [], respaldos: 0 };
const t = i18n.global.t;

beforeEach(() => {
  i18n.global.locale.value = "es";
  fijarBase("A");
  aviso.value = null;
  db.fotosPendientes.mockResolvedValue(nada);
  db.fotosHay.mockResolvedValue(false);
  db.fotosQuitar.mockClear();
  db.fotosQuitarTodas.mockClear();
});

describe("debeAvisar", () => {
  it("es falso sin pendientes, verdadero con alguno y falso si ya se avisó", () => {
    expect(debeAvisar(nada, false)).toBe(false);
    expect(debeAvisar({ organizaciones: ["Norte"], respaldos: 0 }, false)).toBe(true);
    expect(debeAvisar({ organizaciones: [], respaldos: 1 }, false)).toBe(true);
    expect(debeAvisar({ organizaciones: ["Norte"], respaldos: 3 }, true)).toBe(false);
  });
});

describe("textoAviso", () => {
  it("lleva los nombres y el conteo", () => {
    const s = textoAviso({ organizaciones: ["Norte", "Sur"], respaldos: 5 }, t);
    expect(s).toContain("Tienes fotos en «Norte», «Sur» y 5 respaldos.");
    expect(s).toContain("exporta antes cada organización a un .boldo");
    expect(textoAviso({ organizaciones: ["Norte"], respaldos: 1 }, t)).toContain("«Norte» y 1 respaldo.");
    expect(textoAviso({ organizaciones: [], respaldos: 2 }, t)).toContain("Tienes fotos en 2 respaldos.");
  });
});

describe("El aviso", () => {
  it("aviso_no_se_repite_en_la_sesion", async () => {
    db.fotosPendientes.mockResolvedValue({ organizaciones: ["Norte"], respaldos: 2 });
    await revisarAlArrancar("Norte");
    expect(aviso.value?.externa).toBe(false);
    masTarde();
    expect(aviso.value).toBeNull();
    await revisarAlArrancar("Norte");
    expect(aviso.value).toBeNull();
  });

  it("un archivo externo con fotos avisa solo por él, y quitarlas no toca lo demás", async () => {
    db.fotosHay.mockResolvedValue(true);
    await revisarAlArrancar("Externa");
    expect(aviso.value).toMatchObject({ externa: true });
    expect(aviso.value?.texto).toContain("Tienes fotos en «Externa».");
    await quitarAhora();
    expect(db.fotosQuitar).toHaveBeenCalledOnce();
    expect(db.fotosQuitarTodas).not.toHaveBeenCalled();
    expect(aviso.value).toBeNull();
  });
});
