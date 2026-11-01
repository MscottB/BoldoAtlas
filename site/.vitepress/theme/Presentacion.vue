<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import novedades from "../../novedades.json";

// Portada bajo el hero: beneficios, funciones con su captura, comparación, confianza, preguntas y llamada a descargar.
// Todo lo que dice debe ser cierto hoy. «Lo nuevo» sale de novedades.json (sin números de versión).
const props = defineProps<{ lang: "es" | "en" }>();

const REPO = "https://github.com/MscottB/BoldoAtlas";

// Iconos de trazo (24×24, estilo Lucide como la app).
const ICONOS: Record<string, string> = {
  arbol:
    '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  vacante:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  fecha:
    '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  candado: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  codigo: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  escudo:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  sinCuenta:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
  sinRastreo:
    '<path d="M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/>',
  sinRed:
    '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  si: '<path d="M20 6 9 17l-5-5"/>',
  no: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  parcial: '<path d="M5 12h14"/>',
  descargar:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  manual:
    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
};

type Celda = "si" | "no" | ["parcial", string];
interface Funcion {
  id: string;
  etiqueta: string;
  titulo: string;
  texto: string;
  puntos: string[];
  imagen: { nombre: string; ancho: number; alto: number; alt: string; temas: boolean; leyenda?: string };
  enlace?: { texto: string; href: string };
}

const TEXTOS = {
  es: {
    chips: ["Gratis y de código abierto", "Sin cuentas", "No necesita internet", "Windows · Linux · macOS"],
    beneficios: {
      etiqueta: "Para qué sirve",
      titulo: "Todo tu organigrama, claro y bajo control",
      bajada:
        "BoldoAtlas reúne en un solo lugar el árbol de la organización, sus puestos y la ficha de cada persona. Esto es lo que ganas:",
      items: [
        {
          icono: "arbol",
          titulo: "Recorre organizaciones de miles de personas sin perderte",
          texto:
            "Gerencias, áreas y subáreas en un árbol que pliegas y despliegas, y una búsqueda que te lleva a cualquiera. Probado con 2.000 unidades y 10.000 personas.",
        },
        {
          icono: "vacante",
          titulo: "Sabe en segundos qué puestos están vacantes",
          texto:
            "Cada tarjeta muestra sus vacantes, y Revisión lista los puestos sin titular, del que lleva más tiempo al que menos.",
        },
        {
          icono: "fecha",
          titulo: "Mira cómo era tu organización cualquier día",
          texto:
            "Elige una fecha y el organigrama vuelve a ese día, en solo lectura, con los cambios que hubo.",
        },
        {
          icono: "candado",
          titulo: "Tus datos no salen de tu computador",
          texto:
            "Sin servidor ni cuentas, y no necesita internet para funcionar. Una base local con respaldos automáticos.",
        },
      ],
    },
    nuevo: {
      etiqueta: "Lo nuevo",
      titulo: "Mejoras para tu día a día",
      bajada: "Lo último que se suma a BoldoAtlas, lo más nuevo primero.",
      mas: "Leer más en el manual",
    },
    funciones: {
      etiqueta: "Funciones",
      titulo: "Así funciona",
      bajada: "Capturas de la versión actual, con la organización de ejemplo que trae la app.",
      items: [
        {
          id: "arboles",
          etiqueta: "Árboles muy grandes",
          titulo: "Toda la estructura en un solo lienzo",
          texto:
            "Cada tarjeta muestra la jefatura, las caras del equipo, la dotación y las vacantes de la unidad.",
          puntos: [
            "Ramas que se pliegan para ver solo lo que te importa.",
            "Varios árboles en la misma base, y cualquier rama se abre como árbol propio.",
            "Vistas guardadas y resaltado por etiqueta o por texto.",
          ],
          imagen: {
            nombre: "arbol",
            ancho: 1100,
            alto: 915,
            temas: true,
            leyenda: "Organización de ejemplo que trae la app (16 personas)",
            alt: "Organigrama de ejemplo: Gerencia General con Operaciones, Finanzas y Personas; Operaciones abierta hasta Mantención, Producción, Mecánica y Eléctrica, con jefaturas, dotación y vacantes.",
          },
        },
        {
          id: "personas",
          etiqueta: "Personas, puestos y vacantes",
          titulo: "La ficha de cada persona, unida a su puesto",
          texto:
            "Cada puesto sabe quién lo ocupa y quién lo reemplaza. La ficha guarda el contacto, el contrato, la sede y la jornada, con el historial de puestos.",
          puntos: [
            "Vacantes a la vista en cada tarjeta del árbol.",
            "Revisión avisa de puestos vacantes, unidades sin jefatura, personas sin puesto y correos repetidos.",
            "Listas propias de cargos, contratos, sedes y jornadas.",
          ],
          imagen: {
            nombre: "ficha",
            ancho: 1100,
            alto: 813,
            temas: true,
            alt: "Ficha de persona de Andrés Soto: nombre, correo, la unidad que encabeza, su puesto de Gerente con el historial, tipo de contrato, sede y jornada.",
          },
        },
        {
          id: "fechas",
          etiqueta: "El organigrama a cualquier fecha",
          titulo: "Vuelve al pasado sin tocar nada",
          texto:
            "Elige o escribe una fecha y verás la organización tal como estaba ese día, en solo lectura.",
          puntos: [
            "Los días con cambios aparecen marcados en el calendario.",
            "Salta al cambio anterior o al siguiente.",
            "La lista de lo que cambió ese día: quién asumió y quién reemplazó.",
          ],
          imagen: {
            nombre: "fecha",
            ancho: 1100,
            alto: 625,
            temas: true,
            alt: "El organigrama visto al 1 de septiembre de 2026, en solo lectura, con el calendario abierto y el cambio de ese día.",
          },
        },
        {
          id: "directorio",
          etiqueta: "Directorio y búsqueda",
          titulo: "Encuentra a cualquiera en segundos",
          texto:
            "Un directorio con todas las personas y vacantes, con búsqueda, filtros y las columnas que quieras.",
          puntos: [
            "Ctrl+K abre la paleta de comandos: escribe y llega a cualquier unidad o persona.",
            "Ordena por persona, cargo o gerencia.",
            "Busca también dentro del diagrama.",
            "Inicio resume tu organización y recuerda lo último que abriste.",
          ],
          imagen: {
            nombre: "directorio",
            ancho: 1100,
            alto: 533,
            temas: true,
            alt: "Directorio con 18 filas: persona, cargo, gerencia, área y correo, con búsqueda, filtro por unidad y selector de columnas.",
          },
        },
        {
          id: "portable",
          etiqueta: "100 % local y portable",
          titulo: "Llévalo en un pendrive, con tus datos y respaldos",
          texto:
            "La versión portable guarda tus datos y respaldos en la carpeta datos/, junto al programa, y no necesita internet para funcionar. En macOS, el sistema guarda además las preferencias de la ventana y sus cachés en ~/Library.",
          puntos: [
            "Respaldo automático al abrir, y a mano cuando quieras.",
            "Se conservan los 10 más recientes y se restauran desde la misma pantalla.",
            "Antes de cambiar la estructura de la base, BoldoAtlas guarda una copia.",
            "Lleva toda la base, o solo algunas ramas, a otro computador en un archivo .boldo cifrado con un código.",
            "Al importar, revisas las diferencias y decides qué se queda antes de aplicar.",
          ],
          imagen: {
            nombre: "respaldos",
            ancho: 1100,
            alto: 622,
            temas: true,
            alt: "Sección Respaldos de la configuración: último respaldo, botón Respaldar ahora, respaldo automático cada 24 horas y la lista de respaldos para restaurar.",
          },
        },
        {
          id: "sistemas",
          etiqueta: "Windows, Linux y macOS",
          titulo: "En tu sistema y en tu idioma",
          texto: "La misma app en Windows, Linux y macOS, con la interfaz en español o en inglés.",
          puntos: [
            "Windows 10 y 11, Linux (AppImage, .deb y .rpm) y macOS 11 o más nuevo, en Intel y Apple Silicon.",
            "El idioma se cambia al instante; tema claro, oscuro o según el sistema.",
            "Un manual con capturas numeradas y buscador dentro de la app, el mismo que está en este sitio.",
            "Al cerrar la ventana puedes dejar BoldoAtlas en la bandeja y volver al instante.",
          ],
          imagen: {
            nombre: "idioma-en-oscuro",
            ancho: 1100,
            alto: 481,
            temas: false,
            alt: "La app en inglés y en tema oscuro: el menú con Tree, Trees, Directory y Review, y el organigrama de ejemplo.",
          },
          enlace: { texto: "Leer el manual", href: "/manual/inicio" },
        },
      ] as Funcion[],
    },
    comparacion: {
      etiqueta: "Por qué BoldoAtlas",
      titulo: "Lo que una planilla o un dibujo no te dan",
      bajada:
        "Comparado con lo que se suele usar para llevar un organigrama. Las otras columnas son categorías generales: cada producto es distinto.",
      criterio: "Qué necesitas",
      columnas: ["BoldoAtlas", "Planilla de cálculo", "Herramienta de dibujo", "Suite de RR. HH. en la nube"],
      si: "Sí",
      no: "No",
      filas: [
        [
          "El organigrama sale de los datos, sin dibujarlo",
          ["si", ["parcial", "Según la herramienta"], ["parcial", "Según la herramienta"], "si"],
        ],
        ["Fichas, puestos y vacantes en el mismo lugar", ["si", ["parcial", "A mano"], "no", "si"]],
        ["Ver la organización en una fecha pasada", ["si", "no", "no", ["parcial", "Según el producto"]]],
        [
          "Los datos se quedan en tu computador",
          [
            "si",
            ["parcial", "Según la herramienta"],
            ["parcial", "Según la herramienta"],
            ["parcial", "Según el producto"],
          ],
        ],
        [
          "Funciona sin internet",
          [
            "si",
            ["parcial", "Según la herramienta"],
            ["parcial", "Según la herramienta"],
            ["parcial", "Según el producto"],
          ],
        ],
        [
          "Gratis y de código abierto",
          [
            "si",
            ["parcial", "Según la herramienta"],
            ["parcial", "Según la herramienta"],
            ["parcial", "Rara vez"],
          ],
        ],
      ] as [string, Celda[]][],
    },
    confianza: {
      etiqueta: "Confianza",
      titulo: "Sin letra chica",
      items: [
        {
          icono: "codigo",
          titulo: "Código abierto",
          texto: "Licencia AGPL-3.0. Todo el código está en GitHub para que cualquiera lo revise.",
          enlace: { texto: "Ver en GitHub", href: REPO },
        },
        {
          icono: "escudo",
          titulo: "Descargas verificables",
          texto:
            "Cada versión publica SHA256SUMS.txt para comprobar que la descarga llegó completa e intacta.",
          enlace: { texto: "Cómo verificar", href: "/descargas#verificar-la-descarga" },
        },
        {
          icono: "sinCuenta",
          titulo: "Sin cuentas",
          texto: "No hay registro ni inicio de sesión: abres la app y empiezas.",
        },
        {
          icono: "sinRastreo",
          titulo: "Sin rastreo en la app",
          texto: "La app no tiene analítica ni telemetría, y no envía tus datos a ninguna parte.",
        },
        {
          icono: "sinRed",
          titulo: "No necesita internet",
          texto:
            "Funciona completa sin conexión. Cuando busca versiones nuevas (puedes desactivarlo), solo lee la lista pública de versiones y no envía datos.",
        },
      ],
    },
    preguntas: {
      etiqueta: "Preguntas frecuentes",
      titulo: "Lo que suelen preguntar",
      items: [
        {
          p: "¿Cuánto cuesta?",
          r: "Nada. BoldoAtlas es software libre bajo la licencia AGPL-3.0: no hay planes ni suscripciones.",
        },
        {
          p: "¿Dónde quedan mis datos?",
          r: "En una base SQLite en tu computador: en la carpeta datos/, junto al programa, si usas la portable, o en la carpeta de tu usuario si lo instalas. BoldoAtlas no necesita internet para funcionar y no envía tus datos a ninguna parte.",
        },
        {
          p: "¿En qué sistemas funciona?",
          r: "Windows 10 y 11 (x64), Linux x64 y macOS 11 o más nuevo, en Intel y Apple Silicon. El programa aún no tiene firma digital, así que la primera vez tu sistema puede pedir que lo confirmes.",
          enlace: { texto: "Cómo abrirlo", href: "/descargas#sin-firma" },
        },
        {
          p: "¿Cómo se actualiza?",
          r: "BoldoAtlas busca versiones nuevas al abrirse y cada día (puedes cambiar la frecuencia o apagarlo) y te avisa; nunca descarga ni instala nada sin que lo confirmes. En la portable reemplaza el programa dentro de su carpeta y datos/ no se toca. Si la versión nueva cambia la base, antes hace un respaldo. La búsqueda solo lee la lista pública de versiones y no envía datos. También puedes descargar la versión nueva desde este sitio.",
          enlace: { texto: "Cómo actualizar", href: "/descargas#como-actualizar" },
        },
        {
          p: "¿Sirve para organizaciones grandes?",
          r: "Sí, está pensada para eso. Se probó con 2.000 unidades, 3.000 puestos y 10.000 personas: las ramas se pliegan, el directorio dibuja solo las filas a la vista y la búsqueda responde en una fracción de segundo.",
        },
        {
          p: "¿Es una versión final?",
          r: "No: es una versión de prueba. Lo que muestra esta página ya funciona; si algo falla, cuéntalo en GitHub.",
          enlace: { texto: "Avisar de un problema", href: `${REPO}/issues` },
        },
      ],
    },
    final: {
      titulo: "Arma tu organigrama hoy",
      texto:
        "Descárgalo gratis, ábrelo y recorre la organización de ejemplo en un par de minutos. La versión portable guarda tus datos y respaldos junto al programa.",
      descargar: "Descargar portable",
      recomendada: "recomendada",
      manual: "Ver el manual",
      para: "ver las descargas",
      nota: "Gratis · AGPL-3.0 · Sin cuentas",
    },
    rutas: { descargas: "/descargas", manual: "/manual/inicio", prefijo: "" },
  },
  en: {
    chips: ["Free and open source", "No accounts", "No internet needed", "Windows · Linux · macOS"],
    beneficios: {
      etiqueta: "What it's for",
      titulo: "Your whole org chart, clear and under control",
      bajada:
        "BoldoAtlas keeps the organization's tree, its positions and every person's record in one place. Here is what you get:",
      items: [
        {
          icono: "arbol",
          titulo: "Find your way around organizations of thousands of people",
          texto:
            "Divisions, areas and sub-areas in a tree you fold and unfold, and a search that takes you to anyone. Tested with 2,000 units and 10,000 people.",
        },
        {
          icono: "vacante",
          titulo: "Know in seconds which positions are vacant",
          texto:
            "Every card shows its vacancies, and Review lists the positions without a holder, longest-vacant first.",
        },
        {
          icono: "fecha",
          titulo: "See how your organization looked on any day",
          texto: "Pick a date and the org chart goes back to that day, read-only, with the changes it had.",
        },
        {
          icono: "candado",
          titulo: "Your data never leaves your computer",
          texto:
            "No server and no accounts, and it doesn't need the internet to work. A local database with automatic backups.",
        },
      ],
    },
    nuevo: {
      etiqueta: "What's new",
      titulo: "Improvements for your day to day",
      bajada: "The latest additions to BoldoAtlas, newest first.",
      mas: "Read more in the manual",
    },
    funciones: {
      etiqueta: "Features",
      titulo: "How it works",
      bajada: "Screenshots of the current version, with the sample organization that comes with the app.",
      items: [
        {
          id: "arboles",
          etiqueta: "Very large trees",
          titulo: "The whole structure on one canvas",
          texto: "Each card shows the unit's head, the team's faces, the headcount and the vacancies.",
          puntos: [
            "Branches fold away so you see only what matters.",
            "Several trees in one database, and any branch opens as a tree of its own.",
            "Saved views, and highlighting by tag or by text.",
          ],
          imagen: {
            nombre: "arbol",
            ancho: 1100,
            alto: 915,
            temas: true,
            leyenda: "The sample organization that comes with the app (16 people)",
            alt: "Sample org chart: General Management with Operations, Finance and People; Operations open down to Maintenance, Production, Mechanical and Electrical, with heads, headcount and vacancies.",
          },
        },
        {
          id: "personas",
          etiqueta: "People, positions and vacancies",
          titulo: "Every person's record, tied to their position",
          texto:
            "Each position knows who holds it and who covers it. The record keeps contact, contract, site and shift, with the position history.",
          puntos: [
            "Vacancies in plain sight on every card of the tree.",
            "Review flags vacant positions, units without a head, people without a position and repeated emails.",
            "Your own lists of job titles, contracts, sites and shifts.",
          ],
          imagen: {
            nombre: "ficha",
            ancho: 1100,
            alto: 813,
            temas: true,
            alt: "Person record for Andrés Soto: name, email, the unit he heads, his Manager position with its history, contract type, site and shift.",
          },
        },
        {
          id: "fechas",
          etiqueta: "The org chart on any date",
          titulo: "Go back in time without changing anything",
          texto: "Pick or type a date and see the organization exactly as it was that day, read-only.",
          puntos: [
            "Days with changes are marked on the calendar.",
            "Jump to the previous or next change.",
            "The list of what changed that day: who took over and who covered.",
          ],
          imagen: {
            nombre: "fecha",
            ancho: 1100,
            alto: 625,
            temas: true,
            alt: "The org chart as of September 1, 2026, read-only, with the calendar open and that day's change.",
          },
        },
        {
          id: "directorio",
          etiqueta: "Directory and search",
          titulo: "Find anyone in seconds",
          texto: "A directory with every person and vacancy, with search, filters and the columns you want.",
          puntos: [
            "Ctrl+K opens the command palette: type and reach any unit or person.",
            "Sort by person, job title or division.",
            "Search inside the diagram too.",
            "Home sums up your organization and remembers what you opened last.",
          ],
          imagen: {
            nombre: "directorio",
            ancho: 1100,
            alto: 533,
            temas: true,
            alt: "Directory with 18 rows: person, job title, management, area and email, with search, a unit filter and a column picker.",
          },
        },
        {
          id: "portable",
          etiqueta: "100% local and portable",
          titulo: "Carry it on a USB drive, with your data and backups",
          texto:
            "The portable version keeps your data and backups in the datos/ folder, next to the program, and doesn't need the internet to work. On macOS, the system also keeps the window preferences and caches in ~/Library.",
          puntos: [
            "Automatic backup when it opens, and manual backups whenever you like.",
            "The 10 most recent are kept, and you restore them from the same screen.",
            "Before changing the database structure, BoldoAtlas keeps a copy.",
            "Take the whole database, or just some branches, to another computer in a .boldo file encrypted with a code.",
            "When you import, you review the differences and decide what stays before applying.",
          ],
          imagen: {
            nombre: "respaldos",
            ancho: 1100,
            alto: 622,
            temas: true,
            alt: "Backups section of the settings: last backup, a Back up now button, automatic backup every 24 hours and the list of backups to restore.",
          },
        },
        {
          id: "sistemas",
          etiqueta: "Windows, Linux and macOS",
          titulo: "On your system, in your language",
          texto: "The same app on Windows, Linux and macOS, with the interface in English or Spanish.",
          puntos: [
            "Windows 10 and 11, Linux (AppImage, .deb and .rpm) and macOS 11 or newer, on Intel and Apple Silicon.",
            "The language changes instantly; light theme, dark theme or follow the system.",
            "A manual with numbered screenshots and search inside the app, the same one that is on this site.",
            "When you close the window you can keep BoldoAtlas in the tray and come back instantly.",
          ],
          imagen: {
            nombre: "idioma-es-oscuro",
            ancho: 1100,
            alto: 481,
            temas: false,
            alt: "The app in Spanish and in dark theme: the menu with Árbol, Árboles, Directorio and Revisión, and the sample org chart.",
          },
          enlace: { texto: "Read the manual", href: "/en/manual/inicio" },
        },
      ] as Funcion[],
    },
    comparacion: {
      etiqueta: "Why BoldoAtlas",
      titulo: "What a spreadsheet or a drawing won't give you",
      bajada:
        "Compared with what people usually use for an org chart. The other columns are broad categories: every product is different.",
      criterio: "What you need",
      columnas: ["BoldoAtlas", "Spreadsheet", "Drawing tool", "Cloud HR suite"],
      si: "Yes",
      no: "No",
      filas: [
        [
          "The org chart comes from the data, no drawing",
          ["si", ["parcial", "Depends on the tool"], ["parcial", "Depends on the tool"], "si"],
        ],
        ["Records, positions and vacancies in one place", ["si", ["parcial", "By hand"], "no", "si"]],
        ["See the organization on a past date", ["si", "no", "no", ["parcial", "Depends on the product"]]],
        [
          "Your data stays on your computer",
          [
            "si",
            ["parcial", "Depends on the tool"],
            ["parcial", "Depends on the tool"],
            ["parcial", "Depends on the product"],
          ],
        ],
        [
          "Works offline",
          [
            "si",
            ["parcial", "Depends on the tool"],
            ["parcial", "Depends on the tool"],
            ["parcial", "Depends on the product"],
          ],
        ],
        [
          "Free and open source",
          [
            "si",
            ["parcial", "Depends on the tool"],
            ["parcial", "Depends on the tool"],
            ["parcial", "Rarely"],
          ],
        ],
      ] as [string, Celda[]][],
    },
    confianza: {
      etiqueta: "Trust",
      titulo: "No fine print",
      items: [
        {
          icono: "codigo",
          titulo: "Open source",
          texto: "AGPL-3.0 license. All the code is on GitHub for anyone to review.",
          enlace: { texto: "See it on GitHub", href: REPO },
        },
        {
          icono: "escudo",
          titulo: "Verifiable downloads",
          texto:
            "Every release publishes SHA256SUMS.txt so you can check the download arrived complete and intact.",
          enlace: { texto: "How to verify", href: "/en/descargas#verify-the-download" },
        },
        {
          icono: "sinCuenta",
          titulo: "No accounts",
          texto: "No sign-up and no login: open the app and start.",
        },
        {
          icono: "sinRastreo",
          titulo: "No tracking in the app",
          texto: "The app has no analytics and no telemetry, and it sends your data nowhere.",
        },
        {
          icono: "sinRed",
          titulo: "No internet needed",
          texto:
            "It works fully offline. When it checks for new versions (you can turn this off), it only reads the public list of versions and sends no data.",
        },
      ],
    },
    preguntas: {
      etiqueta: "FAQ",
      titulo: "Common questions",
      items: [
        {
          p: "How much does it cost?",
          r: "Nothing. BoldoAtlas is free software under the AGPL-3.0 license: no plans and no subscriptions.",
        },
        {
          p: "Where does my data live?",
          r: "In a SQLite database on your computer: in the datos/ folder next to the program if you use the portable version, or in your user folder if you install it. BoldoAtlas doesn't need the internet to work and sends your data nowhere.",
        },
        {
          p: "Which systems does it run on?",
          r: "Windows 10 and 11 (x64), Linux x64 and macOS 11 or newer, on Intel and Apple Silicon. The program has no digital signature yet, so the first time your system may ask you to confirm.",
          enlace: { texto: "How to open it", href: "/en/descargas#sin-firma" },
        },
        {
          p: "How do I update it?",
          r: "BoldoAtlas checks for new versions when it opens and every day (you can change how often or turn it off) and lets you know; it never downloads or installs anything without your confirmation. The portable version replaces the program inside its folder and datos/ is not touched. If the new version changes the database, it makes a backup first. The check only reads the public list of versions and sends no data. You can also download the new version from this site.",
          enlace: { texto: "How to update", href: "/en/descargas#how-to-update" },
        },
        {
          p: "Does it work for large organizations?",
          r: "Yes, it is built for them. It was tested with 2,000 units, 3,000 positions and 10,000 people: branches fold away, the directory draws only the rows in view and search answers in a fraction of a second.",
        },
        {
          p: "Is it a final version?",
          r: "No: it is a test version. Everything on this page already works; if something fails, tell us on GitHub.",
          enlace: { texto: "Report a problem", href: `${REPO}/issues` },
        },
      ],
    },
    final: {
      titulo: "Build your org chart today",
      texto:
        "Download it for free, open it and explore the sample organization in a couple of minutes. The portable version keeps your data and backups next to the program.",
      descargar: "Download portable",
      recomendada: "recommended",
      manual: "Read the manual",
      para: "see the downloads",
      nota: "Free · AGPL-3.0 · No accounts",
    },
    rutas: { descargas: "/en/descargas", manual: "/en/manual/inicio", prefijo: "/en" },
  },
};

const t = computed(() => TEXTOS[props.lang]);
const enlace = (href: string) => (href.startsWith("http") ? href : withBase(href));
const img = (nombre: string) => withBase(`/capturas/${nombre}.webp`);
const fuente = (f: Funcion, tema: "claro" | "oscuro") =>
  f.imagen.temas ? img(`${f.imagen.nombre}-${props.lang}-${tema}`) : img(f.imagen.nombre);
const SISTEMAS = ["Windows", "Linux", "macOS"];

const urls = import.meta.glob("../../img/es/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const urlsEn = import.meta.glob("../../en/img/en/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const imgAyuda = (nombre: string) =>
  props.lang === "es" ? urls[`../../img/es/${nombre}.webp`] : urlsEn[`../../en/img/en/${nombre}.webp`];
const nuevas = computed(() =>
  novedades.map((n) => {
    const x = (n as Record<string, any>)[props.lang];
    return {
      id: n.id,
      ...x,
      imagen: "imagen" in n ? imgAyuda(n.imagen as string) : undefined,
      href: `${props.lang === "es" ? "" : "/en"}/manual/${n.pagina}${x.ancla ? "#" + x.ancla : ""}`,
    };
  }),
);
</script>

<template>
  <div class="presentacion">
    <ul class="chips" role="list">
      <li v-for="c in t.chips" :key="c">
        <svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ c }}
      </li>
    </ul>

    <section class="seccion" aria-labelledby="beneficios">
      <div class="contenedor">
        <p class="etiqueta">{{ t.beneficios.etiqueta }}</p>
        <h2 id="beneficios">{{ t.beneficios.titulo }}</h2>
        <p class="bajada">{{ t.beneficios.bajada }}</p>
        <ul class="beneficios" role="list">
          <li v-for="b in t.beneficios.items" :key="b.icono">
            <span class="icono"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS[b.icono]" /></span>
            <h3>{{ b.titulo }}</h3>
            <p>{{ b.texto }}</p>
          </li>
        </ul>
      </div>
    </section>

    <section class="seccion suave" aria-labelledby="lo-nuevo">
      <div class="contenedor">
        <p class="etiqueta">{{ t.nuevo.etiqueta }}</p>
        <h2 id="lo-nuevo">{{ t.nuevo.titulo }}</h2>
        <p class="bajada">{{ t.nuevo.bajada }}</p>
        <ul class="nuevo" role="list">
          <li v-for="n in nuevas" :key="n.id">
            <img
              v-if="n.imagen"
              :src="n.imagen"
              :alt="n.alt"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
            <div class="cuerpo">
              <h3>{{ n.titulo }}</h3>
              <p>{{ n.texto }}</p>
              <a class="mas" :href="enlace(n.href)">{{ t.nuevo.mas }} →</a>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="seccion" aria-labelledby="funciones">
      <div class="contenedor">
        <p class="etiqueta">{{ t.funciones.etiqueta }}</p>
        <h2 id="funciones">{{ t.funciones.titulo }}</h2>
        <p class="bajada">{{ t.funciones.bajada }}</p>
        <article
          v-for="(f, i) in t.funciones.items"
          :id="f.id"
          :key="f.id"
          class="funcion"
          :class="{ inverso: i % 2, ancha: i === 0 }"
        >
          <div class="texto">
            <p class="etiqueta">{{ f.etiqueta }}</p>
            <h3>{{ f.titulo }}</h3>
            <p>{{ f.texto }}</p>
            <ul class="puntos">
              <li v-for="p in f.puntos" :key="p">
                <svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ p }}
              </li>
            </ul>
            <a v-if="f.enlace" class="mas" :href="enlace(f.enlace.href)">{{ f.enlace.texto }} →</a>
          </div>
          <figure class="pantalla">
            <template v-if="f.imagen.temas">
              <img
                class="solo-claro"
                :src="fuente(f, 'claro')"
                :alt="f.imagen.alt"
                :width="f.imagen.ancho"
                :height="f.imagen.alto"
                loading="lazy"
                decoding="async"
              />
              <img
                class="solo-oscuro"
                :src="fuente(f, 'oscuro')"
                :alt="f.imagen.alt"
                :width="f.imagen.ancho"
                :height="f.imagen.alto"
                loading="lazy"
                decoding="async"
              />
            </template>
            <img
              v-else
              :src="fuente(f, 'oscuro')"
              :alt="f.imagen.alt"
              :width="f.imagen.ancho"
              :height="f.imagen.alto"
              loading="lazy"
              decoding="async"
            />
            <figcaption v-if="f.imagen.leyenda">{{ f.imagen.leyenda }}</figcaption>
          </figure>
        </article>
      </div>
    </section>

    <section class="seccion suave" aria-labelledby="comparacion">
      <div class="contenedor">
        <p class="etiqueta">{{ t.comparacion.etiqueta }}</p>
        <h2 id="comparacion">{{ t.comparacion.titulo }}</h2>
        <p class="bajada">{{ t.comparacion.bajada }}</p>
        <table class="comparacion">
          <thead>
            <tr>
              <th scope="col">{{ t.comparacion.criterio }}</th>
              <th v-for="(c, i) in t.comparacion.columnas" :key="c" scope="col" :class="{ nuestra: i === 0 }">
                {{ c }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[criterio, celdas] in t.comparacion.filas" :key="criterio">
              <th scope="row">{{ criterio }}</th>
              <td
                v-for="(c, i) in celdas"
                :key="i"
                :data-col="t.comparacion.columnas[i]"
                :class="[Array.isArray(c) ? 'parcial' : c, { nuestra: i === 0 }]"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  v-html="ICONOS[Array.isArray(c) ? 'parcial' : c]"
                />
                <span>{{ Array.isArray(c) ? c[1] : c === "si" ? t.comparacion.si : t.comparacion.no }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="seccion" aria-labelledby="confianza">
      <div class="contenedor">
        <p class="etiqueta">{{ t.confianza.etiqueta }}</p>
        <h2 id="confianza">{{ t.confianza.titulo }}</h2>
        <ul class="confianza" role="list">
          <li v-for="c in t.confianza.items" :key="c.icono">
            <span class="icono"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS[c.icono]" /></span>
            <h3>{{ c.titulo }}</h3>
            <p>{{ c.texto }}</p>
            <a v-if="c.enlace" class="mas" :href="enlace(c.enlace.href)">{{ c.enlace.texto }} →</a>
          </li>
        </ul>
      </div>
    </section>

    <section class="seccion suave" aria-labelledby="preguntas">
      <div class="contenedor angosto">
        <p class="etiqueta">{{ t.preguntas.etiqueta }}</p>
        <h2 id="preguntas">{{ t.preguntas.titulo }}</h2>
        <div class="preguntas">
          <details v-for="q in t.preguntas.items" :key="q.p">
            <summary>{{ q.p }}</summary>
            <p>
              {{ q.r }}
              <a v-if="q.enlace" :href="enlace(q.enlace.href)">{{ q.enlace.texto }}</a>
            </p>
          </details>
        </div>
      </div>
    </section>

    <section class="seccion final" aria-labelledby="final">
      <div class="contenedor angosto">
        <img class="logo" :src="withBase('/icono.png')" alt="" width="72" height="72" loading="lazy" />
        <h2 id="final">{{ t.final.titulo }}</h2>
        <p class="bajada">{{ t.final.texto }}</p>
        <div class="acciones">
          <a class="boton marca" :href="enlace(`${t.rutas.descargas}#portable`)">
            <svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.descargar" />
            {{ t.final.descargar }} <small>({{ t.final.recomendada }})</small>
          </a>
          <a class="boton alt" :href="enlace(t.rutas.manual)">
            <svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.manual" />{{ t.final.manual }}
          </a>
        </div>
        <ul class="sistemas" role="list">
          <li v-for="s in SISTEMAS" :key="s">
            <a :href="enlace(`${t.rutas.descargas}#portable`)" :aria-label="`${s}: ${t.final.para}`">{{
              s
            }}</a>
          </li>
        </ul>
        <p class="nota">{{ t.final.nota }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.presentacion {
  --pr-radio: 16px;
  --pr-sombra: 0 1px 2px rgba(17, 24, 39, 0.06), 0 12px 32px -12px rgba(17, 24, 39, 0.22);
}
.dark .presentacion {
  --pr-sombra: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px -12px rgba(0, 0, 0, 0.7);
}

.contenedor {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}
.contenedor.angosto {
  max-width: 820px;
}
@media (min-width: 640px) {
  .contenedor {
    padding: 0 48px;
  }
}
@media (min-width: 960px) {
  .contenedor {
    padding: 0 64px;
  }
}

/* franjas a todo el ancho; la alterna lleva el fondo suave */
.seccion {
  padding: 64px 0;
}
.seccion.suave {
  background: var(--vp-c-bg-soft);
}
@media (min-width: 960px) {
  .seccion {
    padding: 96px 0;
  }
}

.etiqueta {
  margin: 0 0 8px;
  color: var(--vp-c-brand-1);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h2 {
  margin: 0;
  max-width: 24ch;
  font-size: clamp(1.75rem, 1.2rem + 2.2vw, 2.5rem);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}
.bajada {
  margin: 16px 0 0;
  max-width: 60ch;
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
h3 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-weight: 650;
}
p {
  margin: 0;
}
a.mas {
  display: inline-block;
  margin-top: 16px;
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: none;
}
a.mas:hover {
  text-decoration: underline;
}
a:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
  border-radius: 6px;
}
svg {
  flex: none;
  width: 1em;
  height: 1em;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
ul[role="list"] {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* chips bajo el hero */
.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 12px;
  max-width: 1152px;
  margin: 0 auto !important;
  padding: 8px 24px 0 !important;
}
.chips li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  font-weight: 500;
}
.chips svg {
  color: var(--vp-c-brand-1);
}

/* beneficios */
.beneficios {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: 20px;
  margin-top: 40px !important;
}
.beneficios li,
.confianza li {
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--pr-radio);
  background: var(--vp-c-bg);
}
.beneficios h3 {
  margin-top: 16px;
  font-size: 1.125rem;
  line-height: 1.35;
}
.beneficios p,
.confianza p {
  margin-top: 8px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
.icono {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 22px;
}

/* lo nuevo: tarjetas con la captura de la ayuda, si la hay */
.nuevo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 20px;
  margin-top: 40px !important;
}
.nuevo li {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--pr-radio);
  background: var(--vp-c-bg);
}
.nuevo img {
  display: block;
  width: 100%;
  aspect-ratio: 8 / 5;
  object-fit: cover;
  object-position: top left;
  border-bottom: 1px solid var(--vp-c-divider);
}
.nuevo .cuerpo {
  padding: 24px;
}
.nuevo h3 {
  font-size: 1.125rem;
  line-height: 1.35;
}
.nuevo p {
  margin-top: 8px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

/* funciones: texto y captura alternados */
.funcion {
  display: grid;
  gap: 24px;
  align-items: center;
  margin-top: 56px;
}
.funcion + .funcion {
  margin-top: 72px;
}
@media (min-width: 960px) {
  .funcion {
    grid-template-columns: 5fr 7fr;
    gap: 56px;
  }
  .funcion.inverso {
    grid-template-columns: 7fr 5fr;
  }
  .funcion.inverso .texto {
    order: 2;
  }
  /* la primera, el árbol, va a todo el ancho: con más tarjetas, necesita más tamaño para leerse */
  .funcion.ancha {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .ancha .texto {
    display: grid;
    grid-template-columns: 5fr 7fr;
    column-gap: 56px;
  }
  .ancha .texto > :not(.puntos) {
    grid-column: 1;
  }
  .ancha .puntos {
    grid-column: 2;
    grid-row: 1 / span 3;
    align-self: end;
    margin: 0;
  }
  .funcion + .funcion {
    margin-top: 96px;
  }
}
.funcion h3 {
  font-size: clamp(1.375rem, 1.1rem + 1vw, 1.75rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
  margin-bottom: 12px;
}
.funcion .texto > p:not(.etiqueta) {
  color: var(--vp-c-text-2);
  font-size: 1.0625rem;
  line-height: 1.6;
}
.puntos {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
}
.puntos li {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}
.puntos svg {
  margin-top: 0.25em;
  color: var(--vp-c-brand-1);
}
.pantalla {
  margin: 0;
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
  box-shadow: var(--pr-sombra);
}
.pantalla figcaption {
  padding: 8px 16px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
}
.pantalla img {
  display: block;
  width: 100%;
  height: auto;
}
.dark .solo-claro,
:root:not(.dark) .solo-oscuro {
  display: none;
}

/* comparación */
.comparacion {
  width: 100%;
  margin-top: 40px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.9375rem;
}
.comparacion th,
.comparacion td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  text-align: left;
  vertical-align: middle;
}
.comparacion thead th {
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
  font-weight: 600;
}
.comparacion tbody th {
  font-weight: 500;
  color: var(--vp-c-text-1);
}
.comparacion td {
  color: var(--vp-c-text-2);
}
.comparacion td svg {
  display: inline-block; /* VitePress pone svg en bloque */
  margin-right: 6px;
  vertical-align: -0.15em;
}
.comparacion .si svg {
  color: var(--vp-c-brand-1);
}
.comparacion .nuestra {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.comparacion thead .nuestra {
  border-radius: 12px 12px 0 0;
  color: var(--vp-c-brand-1);
  font-size: 0.9375rem;
}
/* en pantallas angostas cada fila es una tarjeta: sin desplazamiento horizontal */
@media (max-width: 767px) {
  .comparacion thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .comparacion,
  .comparacion tbody,
  .comparacion tr,
  .comparacion th,
  .comparacion td {
    display: block;
  }
  .comparacion tr {
    margin-top: 16px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 12px;
    overflow: hidden;
  }
  .comparacion tbody th {
    font-weight: 650;
  }
  .comparacion td {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
  }
  .comparacion td::before {
    content: attr(data-col);
    color: var(--vp-c-text-2);
    font-weight: 400;
  }
  .comparacion td svg {
    display: none;
  }
  .comparacion tr > :last-child {
    border-bottom: none;
  }
}

/* confianza */
.confianza {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: 16px;
  margin-top: 40px !important;
}
.confianza h3 {
  margin-top: 14px;
  font-size: 1.0625rem;
}
.confianza a.mas {
  margin-top: 10px;
  font-size: 0.9375rem;
}

/* preguntas */
.preguntas {
  margin-top: 32px;
  border-top: 1px solid var(--vp-c-divider);
}
.preguntas details {
  border-bottom: 1px solid var(--vp-c-divider);
}
.preguntas summary {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 4px;
  cursor: pointer;
  list-style: none;
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.preguntas summary::-webkit-details-marker {
  display: none;
}
.preguntas summary::after {
  content: "+";
  flex: none;
  color: var(--vp-c-brand-1);
  font-size: 1.5rem;
  line-height: 1;
}
.preguntas details[open] summary::after {
  content: "−";
}
.preguntas details p {
  padding: 0 4px 20px;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}
.preguntas details a {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

/* llamada final */
.final {
  text-align: center;
  background:
    radial-gradient(60% 80% at 50% 0%, rgba(200, 116, 63, 0.18), transparent 70%), var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}
.final h2,
.final .bajada {
  margin-left: auto;
  margin-right: auto;
}
.logo {
  margin: 0 auto 20px;
  border-radius: 16px;
}
.dark .logo {
  background: #e6ebf1;
  padding: 8px;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}
.boton {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.2s;
}
.boton.marca {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}
.boton.marca:hover {
  background: var(--vp-button-brand-hover-bg);
}
.boton.marca small {
  font-weight: 500;
}
.boton.alt {
  background: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
  border-color: var(--vp-button-alt-border);
}
.boton.alt:hover {
  background: var(--vp-button-alt-hover-bg);
}
.sistemas {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px !important;
}
.sistemas a {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
}
.sistemas a:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.nota {
  margin-top: 16px;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}
</style>
