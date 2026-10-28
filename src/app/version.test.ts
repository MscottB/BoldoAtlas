import { describe, it, expect } from "vitest";
import { versionVisible, infoParaCopiar } from "./version";

describe("version de la app", () => {
  it("versionVisible usa base y fecha", () =>
    expect(versionVisible()).toMatch(/^Versión \d+\.\d+\.\d+.* · \d{8}$/));

  it("infoParaCopiar incluye versión completa, esquema, base y modo", () => {
    const t = infoParaCopiar(
      { dirDatos: "C:/x", rutaBd: "C:/x/boldo.db", portable: true, versionEsquema: 1, error: null },
      { db_id: "abc", data_revision: "7", db_creada: "2026-10-28T10:00:00.000Z" },
    );
    expect(t).toContain(__APP_VERSION__);
    expect(t).toContain("Esquema 1");
    expect(t).toContain("Base abc · revisión 7");
    expect(t).toContain("Modo portable");
  });
});
