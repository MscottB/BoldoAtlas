import { describe, it, expect } from "vitest";
import { puntajeCvss, revisar } from "./auditoria.mjs";

describe("puntajeCvss", () => {
  it.each([
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H", 7.5],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1],
    ["CVSS:3.0/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", 5.5],
    ["CVSS:3.1/AV:N/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N", 0],
  ])("%s = %d", (vector, puntaje) => expect(puntajeCvss(vector)).toBe(puntaje));

  it.each([
    null,
    undefined,
    "",
    "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
    "CVSS:3.1/AV:X",
  ])("%s no se sabe leer", (vector) => expect(puntajeCvss(vector)).toBeNull());
});

describe("revisar", () => {
  const paquete = { name: "x", version: "1.0.0" };
  const vuln = (id: string, cvss: string | null) => ({ advisory: { id, cvss }, package: paquete });

  it("falla con alta, crítica o sin gravedad conocida; no con media ni con avisos", () => {
    const r = revisar({
      vulnerabilities: {
        list: [
          vuln("critica", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
          vuln("alta", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"),
          vuln("media", "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"),
          vuln("desconocida", null),
        ],
      },
      warnings: { unmaintained: [vuln("sin-mantenimiento", null)], unsound: [vuln("unsound", null)] },
    });
    expect(r.graves.map((g) => g.advisory?.id)).toEqual(["critica", "alta", "desconocida"]);
    expect(r.menores.map((m) => m.advisory?.id)).toEqual(["media"]);
    expect(r.avisos.map((a) => a.advisory?.id)).toEqual(["sin-mantenimiento", "unsound"]);
  });

  it("sin vulnerabilidades no falla, aunque no traiga avisos", () =>
    expect(revisar({ vulnerabilities: { list: [] } })).toEqual({ graves: [], menores: [], avisos: [] }));
});
