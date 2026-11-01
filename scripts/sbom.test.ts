import { describe, it, expect } from "vitest";
import { ACTUALIZABLES } from "./release.mjs";
import { SBOM_CARGO, SBOM_NPM, sbomDeVersion } from "./sbom.mjs";

describe("sbomDeVersion", () => {
  const bom = {
    bomFormat: "CycloneDX",
    metadata: { component: { name: "boldo-atlas", version: "0.1.0" } },
    components: [{ name: "vue" }],
  };
  it("pone la versión publicada y conserva lo demás", () =>
    expect(JSON.parse(sbomDeVersion(JSON.stringify(bom), "0.1.0-alpha.21"))).toEqual({
      ...bom,
      metadata: { component: { name: "boldo-atlas", version: "0.1.0-alpha.21" } },
    }));
  it.each([
    ["otro formato", { ...bom, bomFormat: "SPDX" }],
    ["sin componentes", { ...bom, components: [] }],
    ["sin metadatos", { ...bom, metadata: undefined }],
  ])("rechaza una lista %s", (_, malo) =>
    expect(() => sbomDeVersion(JSON.stringify(malo), "1.0.0")).toThrow(/CycloneDX/),
  );
  it("rechaza lo que no es JSON", () => expect(() => sbomDeVersion("", "1.0.0")).toThrow());
});

it("el actualizador nunca ofrece las listas de componentes", () => {
  expect(Object.values(ACTUALIZABLES)).not.toContain(SBOM_NPM);
  expect(Object.values(ACTUALIZABLES)).not.toContain(SBOM_CARGO);
});
