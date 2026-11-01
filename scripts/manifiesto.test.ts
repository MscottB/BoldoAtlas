import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manifiesto, verificarFirma } from "./manifiesto.mjs";
import { ACTUALIZABLES } from "./release.mjs";

// Firma real de `tauri signer sign --app-version 1.2.3-alpha.1` sobre "hola mundo\n", hecha con una clave de
// prueba desechable (no la del autor): así se prueba el formato que de verdad produce la CLI de Tauri.
const DATOS = Buffer.from("hola mundo\n");
const CLAVE_PRUEBA =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDZCRDA2NTFGMEVEN0M3MUEKUldRYXg5Y09IMlhRYTR2SHBGYnBPdW9teVdBamdyeWZFY1h6OVJXUFNLSlp2ZVlHNWNLNDNkSDcK";
const FIRMA =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRYXg5Y09IMlhRYTNacTlIOEFFNjZUdTlKRGdQc3dMZVNzQ01DMGtCUVhGaUZPYUtQdCtxdWJONXVpdkEyNFNsbm5XNDVYVk5iR3QycDZ6Uk5VT3lNeEY5eEN6WEZaQkF3PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkzNDkyMjcxCWZpbGU6ZGF0b3MudHh0CXZlcnNpb246MS4yLjMtYWxwaGEuMQpiSzhDc0tCbkZva0YvYXFZUWxlZS9qS0lGNzhzSDMzSkF4L3ZOY0NIS1BuOUtWWVpvYjBrUStZaW1EaC9FaEpFYWgyaEpWRFV1YnhwTmNLcGhDNlVCZz09Cg==";
const CLAVE_AUTOR = JSON.parse(readFileSync(join("src-tauri", "tauri.conf.json"), "utf8")).plugins.updater
  .pubkey as string;

describe("verificarFirma", () => {
  it("acepta la firma de la CLI de Tauri con su clave y su versión", () => {
    expect(verificarFirma(DATOS, FIRMA, CLAVE_PRUEBA, "1.2.3-alpha.1")).toBeNull();
    expect(verificarFirma(DATOS, FIRMA, CLAVE_PRUEBA, "v1.2.3-alpha.1")).toBeNull();
  });

  it("rechaza otro archivo, otra versión, otra clave o una firma rota", () => {
    expect(verificarFirma(Buffer.from("hola mundo!\n"), FIRMA, CLAVE_PRUEBA, "1.2.3-alpha.1")).toMatch(
      /no corresponde al archivo/,
    );
    expect(verificarFirma(DATOS, FIRMA, CLAVE_PRUEBA, "1.2.3")).toMatch(
      /versión 1\.2\.3-alpha\.1, no de 1\.2\.3/,
    );
    expect(verificarFirma(DATOS, FIRMA, CLAVE_AUTOR, "1.2.3-alpha.1")).toMatch(/otra clave/);
    expect(verificarFirma(DATOS, "no es base64 de minisign", CLAVE_PRUEBA, "1.2.3-alpha.1")).toBeTruthy();
  });

  it("rechaza un comentario de confianza alterado (p. ej. para cambiar la versión firmada)", () => {
    const texto = Buffer.from(FIRMA, "base64")
      .toString("utf8")
      .replace("version:1.2.3-alpha.1", "version:9.9.9");
    const alterada = Buffer.from(texto).toString("base64");
    expect(verificarFirma(DATOS, alterada, CLAVE_PRUEBA, "9.9.9")).toMatch(/comentario de confianza/);
  });
});

describe("manifiesto", () => {
  const firmas = Object.fromEntries(Object.values(ACTUALIZABLES).map((a) => [a, `firma de ${a}\n`]));
  const base = "https://github.com/MscottB/BoldoAtlas/releases/download/v0.1.0-alpha.12";

  it("un objetivo por plataforma, con la URL del release y la firma", () => {
    const m = manifiesto({
      version: "v0.1.0-alpha.12",
      notas: "- n",
      fecha: "2026-11-01T00:00:00.000Z",
      base,
      firmas,
    });
    expect(m.version).toBe("0.1.0-alpha.12");
    expect(Object.keys(m.platforms)).toEqual([
      "windows-x86_64",
      "windows-x86_64-portable",
      "linux-x86_64",
      "darwin-x86_64",
      "darwin-aarch64",
    ]);
    expect(m.platforms["windows-x86_64-portable"]).toEqual({
      signature: "firma de BoldoAtlas_windows_x64_portable.zip",
      url: `${base}/BoldoAtlas_windows_x64_portable.zip`,
    });
    expect(m.platforms["darwin-aarch64"]!.url).toBe(m.platforms["darwin-x86_64"]!.url);
  });

  it("falla si falta una firma: nunca un latest.json incompleto", () => {
    const sinLinux = { ...firmas };
    delete sinLinux["BoldoAtlas_linux_x64.AppImage"];
    expect(() => manifiesto({ version: "1.0.0", notas: "", fecha: "", base, firmas: sinLinux })).toThrow(
      /Falta la firma de BoldoAtlas_linux_x64\.AppImage/,
    );
  });
});
