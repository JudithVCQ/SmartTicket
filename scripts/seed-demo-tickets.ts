/**
 * Repuebla los tickets de la organización demo con un set diseñado para poner a
 * prueba las cuatro funciones de IA. BORRA los tickets existentes de esa
 * organización (y sus comentarios, por el ON DELETE CASCADE).
 *
 *   npm run seed:demo              → organización demo-soluciones-sac
 *   npm run seed:demo -- otro-slug → otra organización
 *
 * El reparto está pensado para que cada función tenga material real:
 *  · auto-resolución  → tickets resueltos con notas de cómo se arreglaron
 *  · incidente masivo → varios tickets abiertos hace minutos con una causa común
 *  · borrador         → conversaciones de ida y vuelta en tickets en curso
 *  · briefing         → volumen repartido en 14 días con Redes disparándose
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { closePool, ensureSchema, query } from "../src/lib/db";
import { SLA_NOT_APPLICABLE, isClosedStatus, slaForPriority } from "../src/lib/ticket-rules";

const ORG_SLUG = process.argv[2] || "demo-soluciones-sac";

const ANA = "ana@demoticket.com";
const BRUNO = "bruno@demoticket.com";
const CARLA = "carla@demoticket.com";

/**
 * Solicitantes: trabajadores que sólo reportan. Se crean con rol `member` para
 * poder demostrar la vista simplificada. Contraseña: Demo123!
 */
const SOLICITANTES = [
  { email: "rosa@demoticket.com", nombre: "Rosa Medina" },
  { email: "marco@demoticket.com", nombre: "Marco Ponce" },
];

interface Comentario {
  autor: string;
  texto: string;
  /** Minutos transcurridos desde la creación del ticket. */
  tras: number;
}

interface SeedTicket {
  asunto: string;
  descripcion: string;
  cliente: string;
  categoria: string;
  prioridad: "Crítica" | "Alta" | "Media" | "Baja";
  estado: "Abierto" | "En progreso" | "En espera" | "Resuelto" | "Cerrado";
  /** Email del técnico asignado, o null si nadie lo tomó todavía. */
  tecnico: string | null;
  /** Antigüedad del ticket en minutos. */
  haceMinutos: number;
  comentarios?: Comentario[];
}

const DIA = 60 * 24;

// ───────────────────────────────────────────────────────────────────────────
// A. Resueltos CON notas de resolución — combustible de la auto-resolución.
//    Sin estos comentarios la IA no tiene de dónde sacar la respuesta.
// ───────────────────────────────────────────────────────────────────────────
const RESUELTOS: SeedTicket[] = [
  {
    asunto: "SUNAT rechaza los comprobantes electrónicos",
    descripcion:
      "Desde ayer en la tarde todos los comprobantes que enviamos a SUNAT vuelven con el error 2335. " +
      "Probamos con boletas y con facturas y pasa lo mismo. No hemos podido entregar comprobante a " +
      "ningún cliente en toda la mañana y la cola en caja está creciendo.",
    cliente: "María Quispe",
    categoria: "Facturación",
    prioridad: "Crítica",
    estado: "Resuelto",
    tecnico: ANA,
    haceMinutos: 11 * DIA,
    comentarios: [
      {
        autor: "Ana Paredes",
        texto:
          "El error 2335 de SUNAT es de certificado digital. Revisé el certificado de la empresa y " +
          "venció el 30 del mes pasado.",
        tras: 25,
      },
      {
        autor: "Ana Paredes",
        texto:
          "SOLUCIÓN: se instaló el certificado digital renovado en Configuración > Facturación " +
          "Electrónica > Certificado, se cargó el .pfx nuevo con su clave y se reinició el servicio " +
          "de conexión con SUNAT desde el panel de servicios. Los comprobantes en cola se " +
          "reenviaron solos en unos 10 minutos. Recordatorio: el certificado vence cada 12 meses.",
        tras: 95,
      },
    ],
  },
  {
    asunto: "La impresora térmica de caja no imprime los tickets",
    descripcion:
      "La impresora de la caja 2 no saca ningún ticket. Tiene luz verde y el papel está bien puesto. " +
      "Cuando mandamos a imprimir no pasa nada, ni siquiera hace ruido. Estamos anotando las ventas " +
      "a mano mientras tanto.",
    cliente: "Nora Flores",
    categoria: "Hardware",
    prioridad: "Alta",
    estado: "Resuelto",
    tecnico: BRUNO,
    haceMinutos: 9 * DIA,
    comentarios: [
      {
        autor: "Bruno Castro",
        texto:
          "SOLUCIÓN: la cola de impresión estaba trabada con 14 trabajos pendientes. Se detuvo el " +
          "servicio Cola de impresión desde services.msc, se borró todo el contenido de " +
          "C:\\Windows\\System32\\spool\\PRINTERS y se volvió a iniciar el servicio. Imprimió al " +
          "primer intento. Si vuelve a pasar, ese es el procedimiento.",
        tras: 40,
      },
    ],
  },
  {
    asunto: "No puedo conectarme a la VPN desde mi casa",
    descripcion:
      "Estoy en home office y el cliente de VPN se queda en 'Conectando...' y después de un rato " +
      "tira error de tiempo de espera agotado. Desde la oficina sí entra normal. Mi internet de casa " +
      "funciona bien para todo lo demás.",
    cliente: "Marco Ponce",
    categoria: "Redes",
    prioridad: "Alta",
    estado: "Resuelto",
    tecnico: BRUNO,
    haceMinutos: 8 * DIA,
    comentarios: [
      {
        autor: "Bruno Castro",
        texto:
          "Confirmado que desde la red interna sí conecta. Apunta a bloqueo del ISP del usuario.",
        tras: 30,
      },
      {
        autor: "Bruno Castro",
        texto:
          "SOLUCIÓN: el proveedor de internet del usuario bloquea el puerto UDP 1194. Se cambió el " +
          "perfil de la VPN a TCP 443 en el archivo de configuración del cliente y conectó de " +
          "inmediato. Para cualquier usuario con el mismo síntoma desde casa, usar el perfil " +
          "'VPN-TCP443' que ya está publicado en la carpeta compartida.",
        tras: 150,
      },
    ],
  },
  {
    asunto: "El CRM demora muchísimo al buscar un cliente",
    descripcion:
      "Buscar un cliente por nombre en el CRM se demora entre 40 segundos y un minuto. Antes era " +
      "instantáneo. Pasa con cualquier usuario y desde cualquier computadora de la oficina. El resto " +
      "de módulos del CRM va normal.",
    cliente: "Luis Cárdenas",
    categoria: "Software",
    prioridad: "Alta",
    estado: "Resuelto",
    tecnico: CARLA,
    haceMinutos: 7 * DIA,
    comentarios: [
      {
        autor: "Carla Rojas",
        texto:
          "SOLUCIÓN: la tabla de clientes había crecido a 180 mil registros y el índice del campo " +
          "nombre estaba fragmentado al 92%. Se reconstruyó el índice y se limpió la caché de " +
          "búsquedas del CRM. La búsqueda bajó a menos de 2 segundos. Se dejó programado un " +
          "mantenimiento de índices todos los domingos a las 3 a.m. para que no se repita.",
        tras: 210,
      },
    ],
  },
  {
    asunto: "Los correos que enviamos llegan a la carpeta de spam del cliente",
    descripcion:
      "Varios clientes nos avisan que nuestras cotizaciones les llegan directo a correo no deseado. " +
      "Pasa sobre todo con clientes que usan Gmail y Outlook. Los correos internos entre nosotros " +
      "llegan bien a la bandeja principal.",
    cliente: "Cecilia Tello",
    categoria: "Redes",
    prioridad: "Media",
    estado: "Cerrado",
    tecnico: ANA,
    haceMinutos: 12 * DIA,
    comentarios: [
      {
        autor: "Ana Paredes",
        texto:
          "SOLUCIÓN: el dominio no tenía registros SPF ni DKIM configurados, por eso los servidores " +
          "de destino lo marcaban como sospechoso. Se agregó el registro SPF en el DNS y se activó " +
          "la firma DKIM en el proveedor de correo. Tarda hasta 24 horas en propagar. Verificado al " +
          "día siguiente con mail-tester: subió de 4.1 a 9.7 de puntaje.",
        tras: 300,
      },
    ],
  },
  {
    asunto: "El punto de venta no descuenta el stock del almacén",
    descripcion:
      "Vendemos en caja y el sistema emite la boleta, pero cuando reviso el inventario el stock sigue " +
      "igual que antes de la venta. Ya llevamos como 60 ventas así y el inventario está totalmente " +
      "descuadrado respecto a lo físico.",
    cliente: "Javier Salas",
    categoria: "Inventario",
    prioridad: "Crítica",
    estado: "Resuelto",
    tecnico: CARLA,
    haceMinutos: 6 * DIA,
    comentarios: [
      {
        autor: "Carla Rojas",
        texto:
          "SOLUCIÓN: el servicio de sincronización entre el punto de venta y el módulo de almacén " +
          "estaba detenido desde el corte de luz del martes. Se reinició el servicio " +
          "'SyncInventario' y se corrió el proceso de reprocesamiento de la cola, que recuperó las " +
          "63 ventas pendientes y ajustó el stock solo. Se configuró el servicio como inicio " +
          "automático para que levante después de un corte.",
        tras: 120,
      },
    ],
  },
  {
    asunto: "Me sale acceso denegado al entrar al módulo de compras",
    descripcion:
      "Necesito registrar las órdenes de compra del mes pero al hacer clic en el módulo de Compras " +
      "me aparece 'No tiene permisos para acceder a este recurso'. Con el resto de módulos no tengo " +
      "problema. Mi jefe dice que ya me habilitaron.",
    cliente: "Fabiola Jiménez",
    categoria: "Software",
    prioridad: "Media",
    estado: "Resuelto",
    tecnico: ANA,
    haceMinutos: 5 * DIA,
    comentarios: [
      {
        autor: "Ana Paredes",
        texto:
          "SOLUCIÓN: el rol 'Compras' sí estaba asignado pero la sesión del usuario tenía los " +
          "permisos viejos en caché. Se asignó el rol desde Administración > Usuarios > Roles y se " +
          "le pidió cerrar sesión y volver a entrar. Los permisos solo se refrescan al iniciar " +
          "sesión de nuevo, no basta con recargar la página.",
        tras: 45,
      },
    ],
  },
  {
    asunto: "El archivo de reportes de Excel no se deja abrir",
    descripcion:
      "El reporte mensual compartido en la carpeta de red me abre siempre en solo lectura y dice que " +
      "está siendo usado por otro usuario, pero nadie del área lo tiene abierto. Necesito editarlo " +
      "para el cierre de mes.",
    cliente: "Patricia Vega",
    categoria: "Software",
    prioridad: "Baja",
    estado: "Cerrado",
    tecnico: CARLA,
    haceMinutos: 10 * DIA,
    comentarios: [
      {
        autor: "Carla Rojas",
        texto:
          "SOLUCIÓN: había quedado un archivo de bloqueo huérfano (~$reporte-mensual.xlsx) de una " +
          "sesión que se cerró mal. Se activó ver archivos ocultos en la carpeta compartida, se " +
          "eliminó ese archivo temporal y el Excel volvió a abrir en modo edición.",
        tras: 60,
      },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// B. Incidente masivo: cinco reportes distintos, una sola causa raíz.
//    Redactados como los escribiría cada usuario, sin nombrar "la red".
// ───────────────────────────────────────────────────────────────────────────
const INCIDENTE_MASIVO: SeedTicket[] = [
  {
    asunto: "No me carga ninguna página en el piso 2",
    descripcion:
      "Estoy en mi puesto del piso 2 y el navegador dice que no hay conexión. Mi compañera de al " +
      "lado tiene el mismo problema. El cable está conectado y la lucecita del switch está prendida.",
    cliente: "Sofía Torres",
    categoria: "Redes",
    prioridad: "Crítica",
    estado: "Abierto",
    tecnico: null,
    haceMinutos: 12,
  },
  {
    asunto: "El CRM no abre desde mi computadora",
    descripcion:
      "Intento entrar al CRM y la pantalla se queda cargando hasta que sale error de tiempo agotado. " +
      "Lo probé en Chrome y en Edge. Un compañero del piso 1 dice que a él sí le abre normal.",
    cliente: "Luis Cárdenas",
    categoria: "Software",
    prioridad: "Alta",
    estado: "Abierto",
    tecnico: null,
    haceMinutos: 26,
  },
  {
    asunto: "Outlook no envía ni recibe correos",
    descripcion:
      "Outlook me aparece 'Desconectado' abajo a la derecha y los correos se quedan en la bandeja de " +
      "salida. Tengo tres cotizaciones urgentes por mandar. Desde el celular con datos sí puedo ver " +
      "mi correo.",
    cliente: "Elena Ríos",
    categoria: "Redes",
    prioridad: "Alta",
    estado: "Abierto",
    tecnico: BRUNO,
    haceMinutos: 34,
  },
  {
    asunto: "La impresora compartida ya no aparece en la lista",
    descripcion:
      "La impresora de la esquina del piso 2 desapareció de mis dispositivos. Antes imprimía sin " +
      "problema. La impresora está prendida y con papel, la revisé personalmente.",
    cliente: "Renzo Morales",
    categoria: "Hardware",
    prioridad: "Media",
    estado: "Abierto",
    tecnico: null,
    haceMinutos: 41,
  },
  {
    asunto: "El sistema me bota cada vez que intento guardar una venta",
    descripcion:
      "Cada vez que le doy guardar a una venta el sistema me saca a la pantalla de inicio de sesión " +
      "y pierdo todo lo que llené. Ya me pasó cuatro veces seguidas. Estoy en el piso 2, en caja.",
    cliente: "Diego Paredes",
    categoria: "Software",
    prioridad: "Crítica",
    estado: "Abierto",
    tecnico: null,
    haceMinutos: 55,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// C. Tickets en curso con conversación — material para el borrador de respuesta.
// ───────────────────────────────────────────────────────────────────────────
const EN_CURSO: SeedTicket[] = [
  {
    asunto: "El sistema de planilla calcula mal el descuento de AFP",
    descripcion:
      "Al generar la planilla de este mes, el descuento de AFP de 6 trabajadores sale más bajo de lo " +
      "que corresponde. Revisé las tasas en el maestro y están bien configuradas. La planilla del " +
      "mes pasado salió correcta con los mismos trabajadores.",
    cliente: "Rosa Medina",
    categoria: "Software",
    prioridad: "Crítica",
    estado: "En progreso",
    tecnico: ANA,
    haceMinutos: 2 * DIA,
    comentarios: [
      {
        autor: "Ana Paredes",
        texto:
          "Ya reproduje el error con dos de los seis casos. Los seis tienen en común que ingresaron " +
          "a mitad de mes, así que apunta al cálculo proporcional.",
        tras: 180,
      },
      {
        autor: "Rosa Medina",
        texto:
          "Confirmo, los seis entraron entre el 10 y el 20. ¿Alcanzamos a corregirlo antes del pago " +
          "del viernes?",
        tras: 420,
      },
      {
        autor: "Ana Paredes",
        texto:
          "Encontré el problema en la fórmula de días proporcionales, está redondeando hacia abajo " +
          "cuando debería considerar el mes de 30 días. Estoy preparando la corrección.",
        tras: 1200,
      },
    ],
  },
  {
    asunto: "Se necesita recuperar la base de datos de un respaldo",
    descripcion:
      "Por error se eliminaron los movimientos de almacén de la semana pasada al correr un proceso " +
      "de limpieza. Necesitamos restaurar esa información desde el respaldo sin perder lo que se ha " +
      "registrado esta semana.",
    cliente: "Omar Suárez",
    categoria: "Software",
    prioridad: "Crítica",
    estado: "En progreso",
    tecnico: CARLA,
    haceMinutos: DIA,
    comentarios: [
      {
        autor: "Carla Rojas",
        texto:
          "Confirmado que el respaldo del domingo está íntegro. Lo voy a restaurar en una base " +
          "aparte para extraer solo los movimientos afectados, así no tocamos lo de esta semana.",
        tras: 90,
      },
      {
        autor: "Carla Rojas",
        texto:
          "Restauración en la base temporal terminada. Identifiqué 1,248 movimientos para " +
          "reinsertar. Voy a validar una muestra con el jefe de almacén antes de cargarlos.",
        tras: 600,
      },
    ],
  },
  {
    asunto: "Solicito capacitación en el módulo de cotizaciones",
    descripcion:
      "Entraron tres personas nuevas al área comercial y necesitan aprender a usar el módulo de " +
      "cotizaciones: cómo armar una cotización, aplicar descuentos y convertirla en orden de venta. " +
      "Preferiríamos una sesión presencial de dos horas.",
    cliente: "Daniela Huamán",
    categoria: "Capacitación",
    prioridad: "Baja",
    estado: "En espera",
    tecnico: CARLA,
    haceMinutos: 3 * DIA,
    comentarios: [
      {
        autor: "Carla Rojas",
        texto:
          "Con gusto. Tengo disponible el jueves de 3 a 5 p.m. o el viernes en la mañana. " +
          "¿Cuál les acomoda mejor?",
        tras: 240,
      },
    ],
  },
  {
    asunto: "La terminal de pagos pide actualización de firmware",
    descripcion:
      "El POS de la caja principal muestra un mensaje de actualización de firmware pendiente cada " +
      "vez que lo encendemos. Por ahora sigue cobrando normal, pero el mensaje no se va y hay que " +
      "cerrarlo manualmente en cada operación.",
    cliente: "Alonso Vera",
    categoria: "Hardware",
    prioridad: "Media",
    estado: "En espera",
    tecnico: BRUNO,
    haceMinutos: 4 * DIA,
    comentarios: [
      {
        autor: "Bruno Castro",
        texto:
          "La actualización la tiene que hacer el proveedor del POS. Ya abrí el caso con ellos, " +
          "número de referencia POS-88421. Me confirmaron visita para esta semana.",
        tras: 300,
      },
    ],
  },
  {
    asunto: "Consulta: ¿cómo exporto el reporte de ventas por vendedor?",
    descripcion:
      "Necesito sacar un reporte de ventas separado por vendedor para el cierre del trimestre. " +
      "Encuentro el reporte general pero no veo dónde filtrar por vendedor ni cómo bajarlo a Excel.",
    cliente: "Germán Castañeda",
    categoria: "Capacitación",
    prioridad: "Baja",
    estado: "Abierto",
    tecnico: null,
    haceMinutos: 5 * 60,
  },
  {
    asunto: "El escáner de código de barras lee números equivocados",
    descripcion:
      "El escáner de la caja 1 lee los códigos pero registra un producto distinto al que se está " +
      "escaneando. Probamos con varios productos y siempre trae el que no es. Con el escáner de la " +
      "caja 2 los mismos productos salen bien.",
    cliente: "Silvia Rojas",
    categoria: "Hardware",
    prioridad: "Alta",
    estado: "En progreso",
    tecnico: BRUNO,
    haceMinutos: 8 * 60,
    comentarios: [
      {
        autor: "Bruno Castro",
        texto:
          "Suena a que el escáner quedó con una configuración de prefijo distinta. Voy a bajar a " +
          "caja para leer la hoja de configuración del manual y reprogramarlo.",
        tras: 120,
      },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// D. Semana previa: poco volumen y sin Redes, para que el briefing detecte que
//    Redes se disparó esta semana.
// ───────────────────────────────────────────────────────────────────────────
const SEMANA_PREVIA: SeedTicket[] = [
  {
    asunto: "Cambio de teclado en el área de ventas",
    descripcion:
      "El teclado del puesto 4 tiene tres teclas que no responden. Se solicita reemplazo por uno " +
      "nuevo del stock de repuestos.",
    cliente: "Lucía Roldán",
    categoria: "Hardware",
    prioridad: "Baja",
    estado: "Cerrado",
    tecnico: BRUNO,
    haceMinutos: 13 * DIA,
    comentarios: [
      {
        autor: "Bruno Castro",
        texto: "SOLUCIÓN: se reemplazó el teclado con uno del stock. Se dio de baja el anterior.",
        tras: 90,
      },
    ],
  },
  {
    asunto: "Alta de usuario para practicante de contabilidad",
    descripcion:
      "Ingresa una practicante al área de contabilidad el lunes. Necesita usuario del sistema con " +
      "acceso de solo lectura a los módulos de contabilidad y facturación.",
    cliente: "Rosa Medina",
    categoria: "Software",
    prioridad: "Baja",
    estado: "Cerrado",
    tecnico: ANA,
    haceMinutos: 12 * DIA,
    comentarios: [
      {
        autor: "Ana Paredes",
        texto:
          "SOLUCIÓN: usuario creado con el perfil 'Consulta Contable'. Credenciales enviadas al " +
          "correo de la jefa del área para que se las entregue en su primer día.",
        tras: 120,
      },
    ],
  },
  {
    asunto: "Revisión de permisos de los supervisores de turno",
    descripcion:
      "Auditoría interna pide validar qué permisos tienen los cuatro supervisores de turno y " +
      "documentar cuáles requieren aprobación de gerencia.",
    cliente: "Raúl Ponce",
    categoria: "Software",
    prioridad: "Media",
    estado: "Resuelto",
    tecnico: CARLA,
    haceMinutos: 11 * DIA,
    comentarios: [
      {
        autor: "Carla Rojas",
        texto:
          "SOLUCIÓN: se generó la matriz de permisos por supervisor y se entregó a auditoría. Se " +
          "retiraron 3 permisos de anulación de comprobantes que no correspondían al rol.",
        tras: 480,
      },
    ],
  },
];

const TODOS = [...RESUELTOS, ...INCIDENTE_MASIVO, ...EN_CURSO, ...SEMANA_PREVIA];

async function main() {
  await ensureSchema({});

  const orgRes = await query({}, "SELECT id, name FROM organizations WHERE slug = $1", [ORG_SLUG]);
  if (orgRes.rowCount === 0) {
    throw new Error(`No existe la organización con slug "${ORG_SLUG}"`);
  }
  const orgId = orgRes.rows[0].id as number;
  console.log(`Organización: ${orgRes.rows[0].name} (id ${orgId})`);

  // El dominio corporativo permite que un compañero se registre solo y caiga
  // en esta organización como solicitante.
  await query({}, "UPDATE organizations SET domain = $1 WHERE id = $2 AND domain IS NULL", [
    "demoticket.com",
    orgId,
  ]);

  for (const s of SOLICITANTES) {
    const hash = await bcrypt.hash("Demo123!", 10);
    await query(
      {},
      `INSERT INTO users (email, password_hash, full_name, company, organization_id, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, 'member', true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name,
             organization_id = EXCLUDED.organization_id,
             role = 'member',
             is_verified = true`,
      [s.email, hash, s.nombre, orgRes.rows[0].name, orgId],
    );
  }

  const usuarios = await query(
    {},
    "SELECT id, email, full_name, role FROM users WHERE organization_id = $1",
    [orgId],
  );
  const idPorEmail = new Map(usuarios.rows.map((u) => [u.email as string, u.id as number]));
  const idPorNombre = new Map(usuarios.rows.map((u) => [u.full_name as string, u.id as number]));
  console.log(`Usuarios en la organización: ${usuarios.rowCount}`);

  const previos = await query({}, "SELECT COUNT(*) AS n FROM tickets WHERE organization_id = $1", [
    orgId,
  ]);
  console.log(`Borrando ${previos.rows[0].n} tickets existentes (y sus comentarios)…`);
  await query({}, "DELETE FROM tickets WHERE organization_id = $1", [orgId]);

  for (const t of TODOS) {
    const creado = new Date(Date.now() - t.haceMinutos * 60_000);
    const asignado = t.tecnico ? (idPorEmail.get(t.tecnico) ?? null) : null;
    const sla = isClosedStatus(t.estado) ? SLA_NOT_APPLICABLE : slaForPriority(t.prioridad);

    // updated_at marca la última actividad: en los cerrados es cuando se resolvió.
    const ultimoComentario = t.comentarios?.[t.comentarios.length - 1];
    const actualizado = ultimoComentario
      ? new Date(creado.getTime() + ultimoComentario.tras * 60_000)
      : creado;

    // Si el nombre del cliente corresponde a un usuario de la organización, el
    // ticket queda a su nombre y lo verá en "Mis tickets". Si no, lo registró
    // el técnico a nombre de alguien externo.
    const solicitante = idPorNombre.get(t.cliente) ?? null;

    const insertado = await query(
      {},
      `INSERT INTO tickets
         (organization_id, assigned_to, subject, description, client, category,
          priority, status, sla, created_at, updated_at, created_by, requester_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        orgId,
        asignado,
        t.asunto,
        t.descripcion,
        t.cliente,
        t.categoria,
        t.prioridad,
        t.estado,
        sla,
        creado.toISOString(),
        actualizado.toISOString(),
        solicitante ?? asignado,
        solicitante,
      ],
    );
    const ticketId = insertado.rows[0].id as number;

    for (const c of t.comentarios ?? []) {
      const autorId = [...idPorEmail.entries()].find(
        ([, id]) => usuarios.rows.find((u) => u.id === id)?.full_name === c.autor,
      )?.[1];

      await query(
        {},
        `INSERT INTO ticket_comments (ticket_id, author_id, author_name, body, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          ticketId,
          autorId ?? null,
          c.autor,
          c.texto,
          new Date(creado.getTime() + c.tras * 60_000).toISOString(),
        ],
      );
    }
  }

  const resumen = await query(
    {},
    `SELECT status, COUNT(*) AS n FROM tickets WHERE organization_id = $1 GROUP BY status ORDER BY 1`,
    [orgId],
  );
  const comentarios = await query(
    {},
    `SELECT COUNT(*) AS n FROM ticket_comments c
       JOIN tickets t ON t.id = c.ticket_id WHERE t.organization_id = $1`,
    [orgId],
  );

  console.log(`\nInsertados ${TODOS.length} tickets y ${comentarios.rows[0].n} comentarios.`);
  console.table(resumen.rows);

  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
