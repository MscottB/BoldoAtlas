import { describe, expect, it, vi } from "vitest";

const openUrl = vi.fn<(u: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => openUrl(u) }));
const { abrirEnlacesFuera, urlExterna } = await import("./enlaces");

describe("urlExterna", () => {
  it("solo http, https y mailto", () => {
    expect(urlExterna("https://github.com/x")).toBe("https://github.com/x");
    expect(urlExterna(" http://a.b ")).toBe("http://a.b");
    expect(urlExterna("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(urlExterna("javascript:alert(1)")).toBeNull();
    expect(urlExterna("respaldos.md")).toBeNull();
    expect(urlExterna("#ancla")).toBeNull();
    expect(urlExterna(null)).toBeNull();
  });
});

describe("abrirEnlacesFuera", () => {
  const clic = (href: string | null) => {
    const enlace = href === null ? null : { getAttribute: () => href };
    const e = { target: { closest: () => enlace }, preventDefault: vi.fn() };
    abrirEnlacesFuera(e as unknown as MouseEvent);
    return e.preventDefault;
  };

  it("un enlace externo se abre fuera y no navega el WebView", () => {
    openUrl.mockClear();
    expect(clic("https://github.com/MscottB/BoldoAtlas")).toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith("https://github.com/MscottB/BoldoAtlas");
  });

  it("un enlace interno o peligroso tampoco navega, y no se abre", () => {
    openUrl.mockClear();
    expect(clic("javascript:alert(1)")).toHaveBeenCalled();
    expect(clic("otra.md")).toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("un clic fuera de un enlace no se toca", () => {
    expect(clic(null)).not.toHaveBeenCalled();
  });
});
