// Solo desarrollo (la app no lo importa): crea una base de prueba grande para medir el rendimiento en una copia portable.
// 2.000 unidades de varios tipos, 3.000 puestos, 10.000 personas con asignaciones (reemplazos e historial), leyendas,
// marcas y vistas guardadas para la medición. Uso:
//   node scripts/sembrar-grande.mjs <carpeta del exe portable>/datos/boldo.db
// La base no debe existir: así nunca se escribe sobre datos reales.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { v7 } from "uuid";

const UNIDADES = 2000;
const PUESTOS = 3000;
const PERSONAS = 10000;
const TIPO = {
  gerencia: "00000000-0000-7000-8000-000000000001",
  area: "00000000-0000-7000-8000-000000000002",
  subarea: "00000000-0000-7000-8000-000000000003",
  otra: "00000000-0000-7000-8000-000000000004",
};

const ruta = process.argv[2];
if (!ruta) throw new Error("Falta la ruta de la base: node scripts/sembrar-grande.mjs <ruta>/boldo.db");
if (existsSync(ruta)) throw new Error(`${ruta} ya existe: este script solo crea bases nuevas.`);

// mulberry32: la misma base en cada corrida
let semilla = 20261028;
const azar = () => {
  semilla = (semilla + 0x6d2b79f5) >>> 0;
  let t = semilla;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const fecha = (desdeAño, hastaAño) =>
  new Date(Date.UTC(desdeAño, 0, 1) + azar() * (Date.UTC(hastaAño, 0, 1) - Date.UTC(desdeAño, 0, 1)))
    .toISOString()
    .slice(0, 10);

const db = new DatabaseSync(ruta);
db.exec(readFileSync(new URL("../src-tauri/migrations/0001_inicial.sql", import.meta.url), "utf8"));
db.exec("PRAGMA user_version = 1; PRAGMA foreign_keys = ON; BEGIN");
const ahora = new Date().toISOString();
const insertar = (tabla, fila) => {
  const f = { ...fila, created_at: ahora, updated_at: ahora };
  const cols = Object.keys(f);
  db.prepare(`INSERT INTO ${tabla} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
    ...Object.values(f),
  );
};
const catalogo = (tabla, nombres) =>
  nombres.map((nombre, orden) => {
    const id = v7();
    insertar(tabla, { id, nombre, orden });
    return id;
  });

db.prepare("INSERT INTO meta (clave, valor) VALUES ('org_nombre', ?)").run("Prueba grande (2.000 unidades)");
const cargos = catalogo("cargos", [
  "Gerente",
  "Subgerente",
  "Jefe de área",
  "Supervisor",
  "Ingeniero",
  "Analista",
  "Técnico",
  "Operador",
  "Asistente",
  "Administrativo",
  "Coordinador",
  "Especialista",
  "Mecánico",
  "Eléctrico",
  "Planificador",
  "Prevencionista",
  "Bodeguero",
  "Chofer",
  "Contador",
  "Abogado",
]);
const contratos = catalogo("tipos_contrato", ["Indefinido", "Plazo fijo", "Honorarios"]);
const sedes = catalogo("sedes", ["Casa matriz", "Planta Norte", "Planta Sur", "Puerto", "Faena"]);
const jornadas = catalogo("jornadas", ["Completa", "Turnos 4x3", "Turnos 7x7"]);
const leyendas = [
  ["Crítico", "#be123c"],
  ["En sucesión", "#b45309"],
  ["Alto potencial", "#0f766e"],
  ["Nuevo", "#2563eb"],
].map(([nombre, color], orden) => {
  const id = v7();
  insertar("leyendas", { id, nombre, color, orden });
  return id;
});

// Árbol: raíz → 12 gerencias → 7 áreas c/u → 6 subáreas c/u → el resto («Otra») repartido entre las subáreas.
const unidades = [];
const nueva = (tipo_id, parent_id, nombre) => {
  const u = { id: v7(), tipo_id, parent_id, nombre, jefe: v7(), orden: unidades.length };
  unidades.push(u);
  return u;
};
const raiz = nueva(TIPO.gerencia, null, "Gerencia General");
const subareas = [];
for (let g = 1; g <= 12; g++) {
  const ger = nueva(TIPO.gerencia, raiz.id, `Gerencia ${g}`);
  ger.marca = [`#${(((g * 2654435761) >>> 8) & 0x7f7f7f).toString(16).padStart(6, "0")}`, `G${g}`];
  for (let a = 1; a <= 7; a++) {
    const area = nueva(TIPO.area, ger.id, `Área ${g}.${a}`);
    for (let s = 1; s <= 6; s++) subareas.push(nueva(TIPO.subarea, area.id, `Subárea ${g}.${a}.${s}`));
  }
}
for (let i = 0; unidades.length < UNIDADES; i++) {
  const padre = subareas[i % subareas.length];
  nueva(TIPO.otra, padre.id, `Unidad ${padre.nombre.slice(8)}.${Math.floor(i / subareas.length) + 1}`);
}
for (const u of unidades)
  insertar("unidades", {
    id: u.id,
    tipo_id: u.tipo_id,
    nombre: u.nombre,
    parent_id: u.parent_id,
    jefe_puesto_id: u.jefe,
    marca_color: u.marca?.[0] ?? null,
    marca_codigo: u.marca?.[1] ?? null,
    orden: u.orden,
  });

// Puestos: la jefatura de cada unidad y 1.000 más repartidos al azar.
const puestos = unidades.map((u) => ({
  id: u.jefe,
  unidad_id: u.id,
  cargo_id: cargos[Number(u.tipo_id.at(-1)) - 1],
}));
while (puestos.length < PUESTOS)
  puestos.push({ id: v7(), unidad_id: elegir(unidades).id, cargo_id: elegir(cargos.slice(4)) });
puestos.forEach((p, orden) =>
  insertar("puestos", { ...p, orden, leyenda_id: azar() < 0.15 ? elegir(leyendas) : null }),
);

const nombres = [
  "Camila",
  "Andrés",
  "Patricio",
  "Luis",
  "Marta",
  "Rosa",
  "Jorge",
  "Elena",
  "Paula",
  "Tomás",
  "Inés",
  "Sofía",
  "Daniela",
  "Matías",
  "Carolina",
  "Felipe",
  "Valentina",
  "Diego",
  "Javiera",
  "Ignacio",
];
const apellidos = [
  "Rojas",
  "Soto",
  "Muñoz",
  "Fuentes",
  "Díaz",
  "Vera",
  "Pizarro",
  "Silva",
  "Araya",
  "Bravo",
  "Lagos",
  "Contreras",
  "Herrera",
  "Núñez",
  "Parra",
  "Ibáñez",
  "González",
  "Morales",
  "Castro",
  "Reyes",
];
const personas = Array.from({ length: PERSONAS }, (_, i) => {
  const id = v7();
  const nombre = `${elegir(nombres)} ${elegir(apellidos)} ${elegir(apellidos)}`;
  insertar("trabajadores", {
    id,
    nombre,
    correo: `persona.${i + 1}@sembrado.test`,
    tipo_contrato_id: elegir(contratos),
    sede_id: elegir(sedes),
    jornada_id: elegir(jornadas),
  });
  return id;
});

// Asignaciones: 93 % de los puestos con titular vigente; 60 % con un titular anterior y 25 % con otro más atrás
// (historial); 5 % con un reemplazo vigente. Cada persona ocupa a lo más un lugar; el resto queda sin asignación.
let siguiente = 0;
const persona = () => personas[siguiente++];
const asignar = (puesto_id, tipo, desde, hasta = null) =>
  insertar("asignaciones", { id: v7(), puesto_id, trabajador_id: persona(), tipo, desde, hasta });
for (const p of puestos) {
  let desde = fecha(2021, 2026);
  if (azar() < 0.93) asignar(p.id, "titular", desde);
  for (const prob of [0.6, 0.25]) {
    if (azar() >= prob) break;
    const antes = fecha(2010, Number(desde.slice(0, 4)));
    asignar(p.id, "titular", antes, desde);
    desde = antes;
  }
  if (azar() < 0.05) asignar(p.id, "reemplazo", fecha(2026, 2026));
}

// Etiquetas y conexiones laterales, unas pocas.
const etiquetas = [];
for (const [nombre, color] of [
  ["Crítica", "#c2410c"],
  ["Turno 24×7", "#2563eb"],
  ["Estratégica", "#7c3aed"],
]) {
  const id = v7();
  insertar("etiquetas", { id, nombre, color });
  etiquetas.push(id);
}
for (let i = 0; i < 100; i++)
  insertar("unidad_etiquetas", { id: v7(), unidad_id: unidades[i * 19].id, etiqueta_id: etiquetas[i % 3] });
for (let i = 1; i <= 5; i++)
  insertar("conexiones", {
    id: v7(),
    origen_id: unidades[i * 7].id,
    destino_id: unidades[i * 97].id,
    etiqueta: `Flujo ${i}`,
  });

// Vistas para medir: «colapsados: []» abre todas las ramas; sin «colapsados» se conservan las de la app.
const vistas = {
  "Medición: todo abierto, vertical normal": { vista: {}, colapsados: [] },
  "Medición: todo abierto, horizontal compacta": {
    vista: { direccion: "horizontal", densidad: "compacta" },
    colapsados: [],
  },
  "Medición: todo abierto, con puestos": { vista: { verPuestos: true }, colapsados: [] },
  "Medición: con puestos, ramas por defecto": { vista: { verPuestos: true } },
};
for (const [nombre, config] of Object.entries(vistas))
  insertar("vistas", { id: v7(), arbol_id: null, nombre, config: JSON.stringify(config) });

db.exec("COMMIT");

// Autocomprobación
const contar = (sql) => Object.values(db.prepare(sql).get())[0];
assert.equal(contar("SELECT count(*) FROM unidades"), UNIDADES);
assert.equal(contar("SELECT count(*) FROM puestos"), PUESTOS);
assert.equal(contar("SELECT count(*) FROM trabajadores"), PERSONAS);
assert.ok(siguiente <= PERSONAS, "faltaron personas para las asignaciones");
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
assert.equal(contar("PRAGMA integrity_check"), "ok");
console.log(
  `Lista ${ruta}: ${UNIDADES} unidades, ${PUESTOS} puestos, ${PERSONAS} personas, ` +
    `${contar("SELECT count(*) FROM asignaciones")} asignaciones ` +
    `(${contar("SELECT count(*) FROM asignaciones WHERE hasta IS NULL AND tipo = 'titular'")} titulares vigentes, ` +
    `${contar("SELECT count(*) FROM asignaciones WHERE hasta IS NULL AND tipo = 'reemplazo'")} reemplazos, ` +
    `${contar("SELECT count(*) FROM asignaciones WHERE hasta IS NOT NULL")} en el historial).`,
);
db.close();
