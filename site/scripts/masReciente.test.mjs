import assert from "node:assert/strict";
import { test } from "node:test";
import { masReciente } from "../.vitepress/theme/masReciente.ts";

const r = (tag_name, published_at, draft = false) => ({ tag_name, published_at, draft });

test("alpha.10 gana a alpha.9 aunque la API la liste detrás", () => {
  const lista = [r("v0.1.0-alpha.9", "2026-10-31T22:44:41Z"), r("v0.1.0-alpha.8", "2026-10-31T21:59:19Z"), r("v0.1.0-alpha.10", "2026-10-31T23:39:14Z")];
  assert.equal(masReciente(lista)?.tag_name, "v0.1.0-alpha.10");
});

test("ignora borradores y sin fecha", () => {
  const lista = [r("v0.2.0", "2026-11-05T00:00:00Z", true), r("v0.1.0", null), r("v0.1.0-alpha.9", "2026-10-31T22:44:41Z")];
  assert.equal(masReciente(lista)?.tag_name, "v0.1.0-alpha.9");
});

test("lista vacía", () => {
  assert.equal(masReciente([]), undefined);
});
