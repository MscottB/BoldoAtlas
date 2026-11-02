<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import novedades from "../../novedades.json";
import { imgAyuda } from "./imagenesAyuda";
import Novedades from "./Novedades.vue";
import { PORTADA } from "./portadaNovedades";

// Portada bajo el hero: por qué, cómo funciona, lo nuevo, confianza, preguntas y llamada a descargar.
// Todo lo que dice debe ser cierto hoy. «Lo nuevo» sale de novedades.json (sin números de versión).
const props = defineProps<{ lang: "es" | "en" }>();

const REPO = "https://github.com/MscottB/BoldoAtlas";

// Iconos de trazo (24×24, estilo Lucide como la app).
const ICONOS: Record<string, string> = {
  codigo: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  escudo:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  sinRastreo:
    '<path d="M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/>',
  si: '<path d="M20 6 9 17l-5-5"/>',
  descargar:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  manual:
    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
};

interface Funcion {
  id: string;
  etiqueta: string;
  titulo: string;
  texto: string;
  puntos: string[];
  // ayuda: la captura sale de la ayuda (ayuda/img), que tiene una sola versión en tema claro
  imagen: { nombre: string; ancho: number; alto: number; alt: string; temas: boolean; ayuda?: boolean; leyenda?: string };
  enlace?: { texto: string; href: string };
}

const TEXTOS = {
  es: {
    chips: ["Gratis y de código abierto", "Sin cuentas", "No necesita internet", "Windows · Linux · macOS"],
    porQue: {
      etiqueta: "Por qué BoldoAtlas",
      titulo: "Cuando la planilla se queda corta y los datos no deben salir de tu computador",
      bajada:
        "En una organización grande, la planilla tiene los datos pero no el organigrama, el dibujo queda atrás al primer cambio, y un servicio en la nube deja las fichas de tu gente en los servidores de otra empresa. BoldoAtlas junta el árbol, los puestos y las fichas en una base que está en tu computador.",
      cifras: [
        { valor: "10.000", texto: "personas, 1.000 de ellas con foto" },
        { valor: "2.000", texto: "unidades y 3.000 puestos" },
        { valor: "< 1 s", texto: "para abrir todo eso" },
      ],
      nota: "Medido en Windows 11, desde abrir la app hasta ver los totales en Inicio, con una organización de prueba y retratos generados: de 0,6 a 0,7 s con fotos optimizadas y de 0,8 a 0,9 s con fotos de 300 KB. Con fotos de 1 MB sin optimizar tardó hasta 2,8 s, y la primera apertura de cada carpeta tarda más porque hace un respaldo.",
      razones: [
        {
          titulo: "El organigrama sale de tus datos",
          texto:
            "No mantienes una planilla y un dibujo por separado. Asignas un titular o mueves una unidad, y el árbol, la dotación y las vacantes se actualizan solos. Cada puesto sabe quién lo ocupa y quién lo reemplaza.",
          enlace: { texto: "Cómo funciona el árbol", href: "/manual/arbol" },
        },
        {
          titulo: "Las fichas de tu gente se quedan contigo",
          texto:
            "Contacto, tipo de contrato, sede, jornada, notas y foto quedan en una base SQLite en tu computador, sin cuentas ni servidor. La única conexión automática es buscar versiones nuevas: no envía datos de tu organización y se puede apagar.",
          enlace: { texto: "Dónde quedan tus datos", href: "/manual/inicio#donde-quedan-tus-datos" },
        },
        {
          titulo: "Compartes solo lo necesario, cifrado",
          texto:
            "Exporta toda la base o solo una rama a un archivo .boldo, cifrado con XChaCha20-Poly1305 y un código de un solo uso que no se guarda en ninguna parte. El archivo va por un canal y el código por otro. De quienes ya no están, una rama lleva solo el nombre y el correo.",
          enlace: { texto: "Cómo exportar e importar", href: "/manual/exportar-importar" },
        },
        {
          titulo: "Sabes quién ocupaba cada puesto en cualquier fecha",
          texto:
            "Cada puesto guarda sus titulares y reemplazos con fechas. Eliges un día y ves quién estaba, qué vacantes había y qué cambió, en solo lectura. Mover o renombrar una unidad no queda registrado: la forma del árbol es la de hoy.",
          enlace: { texto: "Ver a una fecha", href: "/manual/arbol#ver-a-una-fecha" },
        },
        {
          titulo: "Revisión encuentra lo que una planilla no te avisa",
          texto:
            "Una pantalla lista las unidades sin jefatura, los puestos vacantes con los días que llevan, las personas sin puesto, los correos repetidos y los nombres parecidos. Cada aviso abre lo que hay que corregir.",
          enlace: { texto: "Qué revisa", href: "/manual/revision" },
        },
        {
          titulo: "Funciona desde un pendrive, con sus respaldos",
          texto:
            "La portable no se instala: extraes el zip y tus datos quedan en la carpeta datos/, junto al programa. Los cambios se guardan solos, hay un respaldo automático cada 24 horas (se puede cambiar) y otro antes de importar, restaurar o reemplazar datos.",
          enlace: { texto: "Cómo funcionan los respaldos", href: "/manual/respaldos" },
        },
      ],
      comparar: {
        titulo: "¿Lo estás comparando con otro producto?",
        texto:
          "Revisamos Visio, Lucidchart, draw.io, OrgChart, Buk y Talana en sus sitios oficiales: lo que BoldoAtlas ofrece y lo que no tiene, con las fuentes de cada dato.",
        enlace: "Ver la comparación",
      },
    },
    nuevo: {
      etiqueta: "Lo nuevo",
      titulo: "Lo último que ya puedes usar",
      bajada: "Lo más nuevo primero. Cada novedad lleva al tema del manual que la explica.",
      todas: "Ver todas las novedades",
    },
    funciones: {
      etiqueta: "Funciones",
      titulo: "Así funciona",
      bajada: "Capturas de la app con la organización de ejemplo que trae.",
      items: [
        {
          id: "arboles",
          etiqueta: "Árboles muy grandes",
          titulo: "Toda la estructura en un solo lienzo",
          texto:
            "Cada tarjeta muestra la jefatura, las caras del equipo, la dotación y las vacantes de la unidad.",
          puntos: [
            "Ramas que se pliegan, y botones 1, 2, 3 y Todo para elegir cuántos niveles ver.",
            "Relaciones laterales entre unidades: líneas punteadas con su descripción, por el espacio libre entre tarjetas.",
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
            "Listas propias de cargos, contratos, sedes y jornadas.",
            "Las fotos se reducen al elegirlas: se ven igual y pesan mucho menos, también en respaldos y archivos .boldo.",
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
          titulo: "Mira otro día sin tocar nada",
          texto:
            "Elige o escribe una fecha y verás quién ocupaba cada puesto ese día, en solo lectura. La forma del árbol es la de hoy.",
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
            "Inicio muestra los totales de tu organización y lo último que abriste.",
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
            "Respaldo automático cada 24 horas, o con la frecuencia que elijas, y a mano cuando quieras.",
            "Se conservan los 10 más recientes y se restauran desde la misma pantalla.",
            "Antes de cambiar la estructura de la base, BoldoAtlas guarda una copia.",
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
          id: "compartir",
          etiqueta: "Exportar e importar",
          titulo: "Lleva la base o una rama a otro computador",
          texto:
            "Exportar guarda toda la base, o las ramas que marques, en un archivo .boldo cifrado con un código que se muestra una sola vez. Al importar ves qué trae, cuánto es nuevo y cuánto ya existe, y eliges cómo aplicarlo:",
          puntos: [
            "Agregar lo nuevo: entra lo que falta y lo que ya tienes se queda como está.",
            "Revisar y decidir: para dos copias que siguieron cambiando; eliges qué se queda, por registro o campo a campo.",
            "Reemplazar todo: tus datos cambian por los del archivo, solo con un archivo de toda la base.",
            "Antes de aplicar se hace un respaldo, y si algo falla no se escribe nada.",
          ],
          imagen: {
            nombre: "importar-revision",
            ancho: 768,
            alto: 706,
            temas: false,
            ayuda: true,
            alt: "Importar: lo que trae el archivo en una tabla y las opciones Agregar lo nuevo, Revisar y decidir y Reemplazar todo.",
          },
          enlace: { texto: "Leer cómo exportar e importar", href: "/manual/exportar-importar" },
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
    confianza: {
      etiqueta: "Confianza",
      titulo: "Sin letra chica",
      comprobar: "Lo que puedes comprobar",
      items: [
        {
          icono: "codigo",
          titulo: "Código abierto",
          texto: "Licencia AGPL-3.0. Todo el código está en GitHub para que cualquiera lo revise.",
          enlace: { texto: "Ver en GitHub", href: REPO },
        },
        {
          icono: "escudo",
          titulo: "Descargas y actualizaciones verificables",
          texto:
            "Cada versión publica SHA256SUMS.txt y la lista de sus componentes. La app rechaza una actualización si su firma no coincide.",
          enlace: { texto: "Cómo verificar", href: "/descargas#verificar-la-descarga" },
        },
        {
          icono: "sinRastreo",
          titulo: "Sin rastreo en la app",
          texto: "La app no tiene analítica ni telemetría, y no envía tus datos a ninguna parte.",
        },
      ],
      limites: {
        titulo: "Lo que debes saber antes de elegirla",
        items: [
          {
            titulo: "No tiene usuarios ni permisos.",
            texto:
              "Quien abre la app ve y cambia todo, y no queda registro de quién cambió qué. Tampoco hay edición en línea entre varias personas: cada copia se trabaja aparte y se juntan con un archivo .boldo.",
          },
          {
            titulo: "La base y los respaldos no van cifrados.",
            texto:
              "Solo van cifrados los archivos .boldo. Protege lo demás con el cifrado de tu disco (BitLocker, FileVault o LUKS) y cuida el pendrive.",
          },
          {
            titulo: "El programa no tiene firma digital.",
            texto: "No lleva certificado de Windows ni de Apple, así que el sistema avisa la primera vez que lo abres.",
            enlace: { texto: "Cómo abrirlo", href: "/descargas#sin-firma" },
          },
          {
            titulo: "No importa planillas ni exporta a PDF.",
            texto:
              "Las unidades, los puestos y las personas se crean en la app o llegan en un archivo .boldo.",
          },
          {
            titulo: "Te ayuda a cumplir, no reemplaza tu trabajo legal.",
            texto:
              "Tener los datos personales en tu computador te ayuda a cumplir las reglas que te apliquen, pero tratarlos conforme a la ley es responsabilidad de quien usa la app.",
            enlace: { texto: "Qué protege y qué no", href: `${REPO}/blob/main/SECURITY.md#política-de-seguridad` },
          },
        ],
      },
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
          p: "¿Puedo traer mis datos desde Excel u otra planilla?",
          r: "No. BoldoAtlas no importa planillas: las unidades, los puestos y las personas se crean dentro de la app, o llegan en un archivo .boldo exportado desde otra copia.",
        },
        {
          p: "¿Dónde quedan mis datos?",
          r: "En una base SQLite en tu computador: en la carpeta datos/, junto al programa, si usas la portable, o en la carpeta de tu usuario si lo instalas. BoldoAtlas no necesita internet para funcionar y no envía tus datos a ninguna parte.",
        },
        {
          p: "¿Podemos trabajar varias personas?",
          r: "Cada copia se trabaja por separado, sin usuarios ni permisos. Para juntar el trabajo, una persona exporta un archivo .boldo y la otra lo importa con Revisar y decidir: compara los dos lados y elige qué se queda.",
          enlace: { texto: "Revisar y decidir", href: "/manual/exportar-importar#revisar-y-decidir" },
        },
        {
          p: "¿En qué sistemas funciona?",
          r: "Windows 10 y 11 (x64), Linux x64 y macOS 11 o más nuevo, en Intel y Apple Silicon. El programa no tiene firma digital, así que la primera vez tu sistema puede pedir que lo confirmes.",
          enlace: { texto: "Cómo abrirlo", href: "/descargas#sin-firma" },
        },
        {
          p: "¿Cómo se actualiza?",
          r: "BoldoAtlas busca versiones nuevas al abrirse y cada día (puedes cambiar la frecuencia o apagarlo) y te avisa; nunca descarga ni instala nada sin que lo confirmes. En la portable reemplaza el programa dentro de su carpeta y datos/ no se toca. Si la versión nueva cambia la base, antes hace un respaldo.",
          enlace: { texto: "Cómo actualizar", href: "/descargas#como-actualizar" },
        },
        {
          p: "¿Sirve para organizaciones grandes?",
          r: "Sí, está pensada para eso. Se probó con 2.000 unidades, 3.000 puestos y 10.000 personas: las ramas se pliegan, el directorio dibuja solo las filas a la vista y las fotos se cargan cuando aparecen. Con más de 300 tarjetas a la vista, el lienzo las simplifica al alejarte, y antes de desplegar más de 1.000 te avisa, porque se vuelve lento.",
        },
        {
          p: "¿Es una versión final?",
          r: "No: es una versión de prueba. Lo que muestra esta página ya funciona; si algo falla, cuéntalo en GitHub.",
          enlace: { texto: "Avisar de un problema", href: `${REPO}/issues` },
        },
      ],
    },
    final: {
      titulo: "Pruébalo con la organización de ejemplo",
      texto:
        "Descarga la portable, extrae el zip y abre el ejemplo que trae: lo recorres en un par de minutos, y cuando quieras creas la tuya.",
      descargar: "Descargar portable",
      recomendada: "recomendada",
      manual: "Ver el manual",
      para: "ver las descargas",
      nota: "Gratis · AGPL-3.0 · Sin cuentas",
    },
    rutas: {
      descargas: "/descargas",
      manual: "/manual/inicio",
      prefijo: "",
      novedades: "/novedades",
      comparar: "/comparar",
    },
  },
  en: {
    chips: ["Free and open source", "No accounts", "No internet needed", "Windows · Linux · macOS"],
    porQue: {
      etiqueta: "Why BoldoAtlas",
      titulo: "When the spreadsheet falls short and the data must stay on your computer",
      bajada:
        "In a large organization, the spreadsheet has the data but not the org chart, the drawing falls behind at the first change, and a cloud service leaves your people's records on another company's servers. BoldoAtlas brings the tree, the positions and the records together in a database on your computer.",
      cifras: [
        { valor: "10,000", texto: "people, 1,000 of them with a photo" },
        { valor: "2,000", texto: "units and 3,000 positions" },
        { valor: "< 1 s", texto: "to open all of that" },
      ],
      nota: "Measured on Windows 11, from opening the app to seeing the totals on Home, with a test organization and generated portraits: 0.6 to 0.7 s with optimized photos and 0.8 to 0.9 s with 300 KB photos. With unoptimized 1 MB photos it took up to 2.8 s, and the first opening of each folder takes longer because it makes a backup.",
      razones: [
        {
          titulo: "The org chart comes from your data",
          texto:
            "You don't keep a spreadsheet and a drawing apart. Assign a holder or move a unit, and the tree, the headcount and the vacancies update on their own. Each position knows who holds it and who covers it.",
          enlace: { texto: "How the tree works", href: "/en/manual/arbol" },
        },
        {
          titulo: "Your people's records stay with you",
          texto:
            "Contact details, contract type, site, shift, notes and photo stay in a SQLite database on your computer, with no accounts and no server. The only automatic connection is the check for new versions: it sends no organization data and you can turn it off.",
          enlace: { texto: "Where your data lives", href: "/en/manual/inicio#where-your-data-lives" },
        },
        {
          titulo: "You share only what's needed, encrypted",
          texto:
            "Export the whole database or a single branch to a .boldo file, encrypted with XChaCha20-Poly1305 and a one-time code that is not saved anywhere. The file goes through one channel and the code through another. For people who have left, a branch carries only their name and email.",
          enlace: { texto: "How to export and import", href: "/en/manual/exportar-importar" },
        },
        {
          titulo: "You know who held each position on any date",
          texto:
            "Each position keeps its holders and covers with dates. Pick a day and see who was there, which vacancies existed and what changed, read-only. Moving or renaming a unit isn't recorded: the shape of the tree is today's.",
          enlace: { texto: "Viewing a past date", href: "/en/manual/arbol#viewing-a-past-date" },
        },
        {
          titulo: "Review finds what a spreadsheet doesn't tell you",
          texto:
            "One screen lists units without a head, vacant positions with how long they've been open, people without a position, repeated emails and similar names. Each alert opens what needs fixing.",
          enlace: { texto: "What it checks", href: "/en/manual/revision" },
        },
        {
          titulo: "It runs from a USB drive, with its backups",
          texto:
            "The portable version doesn't install: extract the zip and your data stays in the datos/ folder, next to the program. Changes save on their own, there is an automatic backup every 24 hours (you can change that) and another before importing, restoring or replacing data.",
          enlace: { texto: "How backups work", href: "/en/manual/respaldos" },
        },
      ],
      comparar: {
        titulo: "Comparing it with another product?",
        texto:
          "We reviewed Visio, Lucidchart, draw.io, OrgChart, Buk and Talana on their official sites: what BoldoAtlas offers and what it lacks, with the source of every data point.",
        enlace: "See the comparison",
      },
    },
    nuevo: {
      etiqueta: "What's new",
      titulo: "The latest you can already use",
      bajada: "Newest first. Each item leads to the manual topic that explains it.",
      todas: "See everything that's new",
    },
    funciones: {
      etiqueta: "Features",
      titulo: "How it works",
      bajada: "Screenshots of the app with the sample organization it comes with.",
      items: [
        {
          id: "arboles",
          etiqueta: "Very large trees",
          titulo: "The whole structure on one canvas",
          texto: "Each card shows the unit's head, the team's faces, the headcount and the vacancies.",
          puntos: [
            "Branches fold away, and the 1, 2, 3 and All buttons choose how many levels you see.",
            "Lateral connections between units: dotted lines with their description, through the free space between cards.",
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
            "Your own lists of job titles, contracts, sites and shifts.",
            "Photos are reduced when you choose them: they look the same and weigh much less, in backups and .boldo files too.",
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
          titulo: "Look at another day without changing anything",
          texto: "Pick or type a date and see who held each position that day, read-only. The shape of the tree is today's.",
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
            "Home shows your organization's totals and what you opened last.",
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
            "Automatic backup every 24 hours, or as often as you choose, and manual backups whenever you like.",
            "The 10 most recent are kept, and you restore them from the same screen.",
            "Before changing the database structure, BoldoAtlas keeps a copy.",
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
          id: "compartir",
          etiqueta: "Export and import",
          titulo: "Take the database or a branch to another computer",
          texto:
            "Export saves the whole database, or the branches you check, in a .boldo file encrypted with a code shown only once. When you import, you see what it carries, how much is new and how much already exists, and you choose how to apply it:",
          puntos: [
            "Add what is new: what's missing comes in and what you already have stays as it is.",
            "Review and decide: for two copies that kept changing; you choose what stays, record by record or field by field.",
            "Replace everything: your data is swapped for the file's, only with a file of the whole database.",
            "A backup is made before applying, and if something fails nothing is written.",
          ],
          imagen: {
            nombre: "importar-revision",
            ancho: 768,
            alto: 706,
            temas: false,
            ayuda: true,
            alt: "Import: what the file carries in a table and the Add what is new, Review and decide and Replace everything options.",
          },
          enlace: { texto: "Read how to export and import", href: "/en/manual/exportar-importar" },
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
    confianza: {
      etiqueta: "Trust",
      titulo: "No fine print",
      comprobar: "What you can check",
      items: [
        {
          icono: "codigo",
          titulo: "Open source",
          texto: "AGPL-3.0 license. All the code is on GitHub for anyone to review.",
          enlace: { texto: "See it on GitHub", href: REPO },
        },
        {
          icono: "escudo",
          titulo: "Verifiable downloads and updates",
          texto:
            "Every release publishes SHA256SUMS.txt and the list of its components. The app rejects an update if its signature doesn't match.",
          enlace: { texto: "How to verify", href: "/en/descargas#verify-the-download" },
        },
        {
          icono: "sinRastreo",
          titulo: "No tracking in the app",
          texto: "The app has no analytics and no telemetry, and it sends your data nowhere.",
        },
      ],
      limites: {
        titulo: "What you should know before choosing it",
        items: [
          {
            titulo: "It has no users or permissions.",
            texto:
              "Whoever opens the app sees and changes everything, and nothing records who changed what. There is no online editing between people either: each copy is worked on separately and they are merged with a .boldo file.",
          },
          {
            titulo: "The database and backups are not encrypted.",
            texto:
              "Only .boldo files are encrypted. Protect the rest with your disk's encryption (BitLocker, FileVault or LUKS) and look after the USB drive.",
          },
          {
            titulo: "The program has no digital signature.",
            texto: "It carries no Windows or Apple certificate, so the system warns you the first time you open it.",
            enlace: { texto: "How to open it", href: "/en/descargas#sin-firma" },
          },
          {
            titulo: "It doesn't import spreadsheets or export to PDF.",
            texto: "Units, positions and people are created in the app or arrive in a .boldo file.",
          },
          {
            titulo: "It helps you meet the rules; it doesn't replace your legal work.",
            texto:
              "Keeping personal data on your computer helps you meet the rules that apply to you, but handling it lawfully is the responsibility of whoever uses the app.",
            enlace: { texto: "What it protects and what it doesn't", href: `${REPO}/blob/main/SECURITY.md` },
          },
        ],
      },
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
          p: "Can I bring my data from Excel or another spreadsheet?",
          r: "No. BoldoAtlas doesn't import spreadsheets: units, positions and people are created inside the app, or arrive in a .boldo file exported from another copy.",
        },
        {
          p: "Where does my data live?",
          r: "In a SQLite database on your computer: in the datos/ folder next to the program if you use the portable version, or in your user folder if you install it. BoldoAtlas doesn't need the internet to work and sends your data nowhere.",
        },
        {
          p: "Can several people work on it?",
          r: "Each copy is worked on separately, with no users or permissions. To merge the work, one person exports a .boldo file and the other imports it with Review and decide: it compares both sides and you choose what stays.",
          enlace: { texto: "Review and decide", href: "/en/manual/exportar-importar#review-and-decide" },
        },
        {
          p: "Which systems does it run on?",
          r: "Windows 10 and 11 (x64), Linux x64 and macOS 11 or newer, on Intel and Apple Silicon. The program has no digital signature, so the first time your system may ask you to confirm.",
          enlace: { texto: "How to open it", href: "/en/descargas#sin-firma" },
        },
        {
          p: "How do I update it?",
          r: "BoldoAtlas checks for new versions when it opens and every day (you can change how often or turn it off) and lets you know; it never downloads or installs anything without your confirmation. The portable version replaces the program inside its folder and datos/ is not touched. If the new version changes the database, it makes a backup first.",
          enlace: { texto: "How to update", href: "/en/descargas#how-to-update" },
        },
        {
          p: "Does it work for large organizations?",
          r: "Yes, it is built for them. It was tested with 2,000 units, 3,000 positions and 10,000 people: branches fold away, the directory draws only the rows in view and photos load when they appear. With more than 300 cards in view, the canvas simplifies them when you zoom out, and before expanding past 1,000 it warns you, because it gets slow.",
        },
        {
          p: "Is it a final version?",
          r: "No: it is a test version. Everything on this page already works; if something fails, tell us on GitHub.",
          enlace: { texto: "Report a problem", href: `${REPO}/issues` },
        },
      ],
    },
    final: {
      titulo: "Try it with the sample organization",
      texto:
        "Download the portable version, extract the zip and open the sample it comes with: you can explore it in a couple of minutes, and create your own whenever you like.",
      descargar: "Download portable",
      recomendada: "recommended",
      manual: "Read the manual",
      para: "see the downloads",
      nota: "Free · AGPL-3.0 · No accounts",
    },
    rutas: {
      descargas: "/en/descargas",
      manual: "/en/manual/inicio",
      prefijo: "/en",
      novedades: "/en/novedades",
      comparar: "/en/comparar",
    },
  },
};

const t = computed(() => TEXTOS[props.lang]);
const enlace = (href: string) => (href.startsWith("http") ? href : withBase(href));
const img = (nombre: string) => withBase(`/capturas/${nombre}.webp`);
const fuente = (f: Funcion, tema: "claro" | "oscuro") => {
  if (f.imagen.ayuda) return imgAyuda(props.lang, f.imagen.nombre);
  return f.imagen.temas ? img(`${f.imagen.nombre}-${props.lang}-${tema}`) : img(f.imagen.nombre);
};
const SISTEMAS = ["Windows", "Linux", "macOS"];

const hayMas = novedades.length > PORTADA;
</script>

<template>
  <div class="presentacion">
    <ul class="chips" role="list">
      <li v-for="c in t.chips" :key="c">
        <svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ c }}
      </li>
    </ul>

    <section class="seccion" aria-labelledby="por-que">
      <div class="contenedor">
        <p class="etiqueta">{{ t.porQue.etiqueta }}</p>
        <h2 id="por-que" class="ancho">{{ t.porQue.titulo }}</h2>
        <p class="bajada">{{ t.porQue.bajada }}</p>

        <div class="medida">
          <dl class="cifras">
            <div v-for="c in t.porQue.cifras" :key="c.valor">
              <dt>{{ c.texto }}</dt>
              <dd>{{ c.valor }}</dd>
            </div>
          </dl>
          <p class="nota-medida">{{ t.porQue.nota }}</p>
        </div>

        <ul class="razones" role="list">
          <li v-for="r in t.porQue.razones" :key="r.titulo">
            <h3>{{ r.titulo }}</h3>
            <div>
              <p>{{ r.texto }}</p>
              <a class="mas" :href="enlace(r.enlace.href)">{{ r.enlace.texto }} →</a>
            </div>
          </li>
        </ul>

        <div class="a-comparar">
          <div>
            <h3>{{ t.porQue.comparar.titulo }}</h3>
            <p>{{ t.porQue.comparar.texto }}</p>
          </div>
          <a class="boton alt" :href="enlace(t.rutas.comparar)">{{ t.porQue.comparar.enlace }} →</a>
        </div>
      </div>
    </section>

    <section class="seccion suave" aria-labelledby="funciones">
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

    <section class="seccion" aria-labelledby="lo-nuevo">
      <div class="contenedor">
        <p class="etiqueta">{{ t.nuevo.etiqueta }}</p>
        <h2 id="lo-nuevo">{{ t.nuevo.titulo }}</h2>
        <p class="bajada">{{ t.nuevo.bajada }}</p>
        <Novedades :lang="lang" ultimas />
        <a v-if="hayMas" class="mas todas" :href="enlace(t.rutas.novedades)">{{ t.nuevo.todas }} ({{ novedades.length }}) →</a>
      </div>
    </section>

    <section class="seccion suave" aria-labelledby="confianza">
      <div class="contenedor">
        <p class="etiqueta">{{ t.confianza.etiqueta }}</p>
        <h2 id="confianza">{{ t.confianza.titulo }}</h2>
        <div class="dos-columnas">
          <div>
            <h3 class="subtitulo">{{ t.confianza.comprobar }}</h3>
            <ul class="confianza" role="list">
              <li v-for="c in t.confianza.items" :key="c.icono">
                <span class="icono"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS[c.icono]" /></span>
                <div>
                  <h4>{{ c.titulo }}</h4>
                  <p>{{ c.texto }}</p>
                  <a v-if="c.enlace" class="mas" :href="enlace(c.enlace.href)">{{ c.enlace.texto }} →</a>
                </div>
              </li>
            </ul>
          </div>
          <div>
            <h3 class="subtitulo">{{ t.confianza.limites.titulo }}</h3>
            <ul class="limites" role="list">
              <li v-for="l in t.confianza.limites.items" :key="l.titulo">
                <strong>{{ l.titulo }}</strong>
                {{ l.texto }}
                <a v-if="l.enlace" :href="enlace(l.enlace.href)">{{ l.enlace.texto }}</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="seccion" aria-labelledby="preguntas">
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
a.mas.todas {
  margin-top: 28px;
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

/* por qué: la cifra medida y las razones en filas */
h2.ancho {
  max-width: 30ch;
}
.medida {
  margin-top: 40px;
  padding: 28px;
  border: 1px solid var(--vp-c-brand-3);
  border-radius: var(--pr-radio);
  background: var(--vp-c-brand-soft);
}
.cifras {
  display: grid;
  gap: 20px;
  margin: 0;
}
.cifras div {
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-end;
  margin: 0;
}
.cifras dd {
  margin: 0;
  color: var(--vp-c-brand-1);
  font-size: clamp(2.25rem, 1.8rem + 2vw, 3.25rem);
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.cifras dt {
  margin-top: 6px;
  color: var(--vp-c-text-1);
  font-weight: 500;
  line-height: 1.4;
}
.nota-medida {
  margin-top: 20px;
  max-width: 90ch;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
  line-height: 1.6;
}
@media (min-width: 768px) {
  .cifras {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.razones {
  margin-top: 40px !important;
  border-bottom: 1px solid var(--vp-c-divider);
}
.razones li {
  display: grid;
  gap: 8px;
  padding: 24px 0;
  border-top: 1px solid var(--vp-c-divider);
}
.razones h3 {
  font-size: 1.25rem;
  line-height: 1.3;
  letter-spacing: -0.01em;
}
.razones p {
  color: var(--vp-c-text-2);
  line-height: 1.65;
}
.razones a.mas {
  margin-top: 8px;
}
@media (min-width: 768px) {
  .razones li {
    grid-template-columns: 5fr 7fr;
    gap: 40px;
  }
}
.a-comparar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 32px;
  margin-top: 32px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--pr-radio);
  background: var(--vp-c-bg-soft);
}
.a-comparar > div {
  flex: 1 1 20rem;
}
.a-comparar h3 {
  font-size: 1.125rem;
}
.a-comparar p {
  margin-top: 4px;
  max-width: 70ch;
  color: var(--vp-c-text-2);
  line-height: 1.55;
}
.icono {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 22px;
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

/* confianza: lo que se puede comprobar y, al lado, lo que falta */
.dos-columnas {
  display: grid;
  gap: 32px;
  margin-top: 32px;
}
@media (min-width: 960px) {
  .dos-columnas {
    grid-template-columns: 1fr 1fr;
    gap: 56px;
  }
}
.subtitulo {
  font-size: 1.125rem;
}
.confianza {
  margin-top: 16px !important;
}
.confianza li {
  display: flex;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--pr-radio);
  background: var(--vp-c-bg);
}
.confianza li + li {
  margin-top: 12px;
}
.confianza h4 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 1.0625rem;
  font-weight: 650;
}
.confianza p {
  margin-top: 4px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
.confianza a.mas {
  margin-top: 8px;
  font-size: 0.9375rem;
}
.limites {
  margin-top: 16px !important;
}
.limites li {
  padding: 14px 0;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
.limites strong {
  color: var(--vp-c-text-1);
  font-weight: 650;
}
.limites a {
  color: var(--vp-c-brand-1);
  font-weight: 600;
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
