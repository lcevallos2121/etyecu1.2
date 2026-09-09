import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function clienteNombreDeLaSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("portal_sesion")?.value;
  if (!cookie) return null;
  const [accesoId] = cookie.split(":");
  const { data: acceso } = await supabaseAdmin
    .from("portal_accesos")
    .select("id, cliente_nombre, activo")
    .eq("id", accesoId)
    .maybeSingle();
  if (!acceso || !acceso.activo) return null;
  return acceso.cliente_nombre;
}

// Preguntas de respuesta rápida que el bot sabe contestar automáticamente,
// sin esperar a que un asesor humano responda.
const PREGUNTAS_VALIDAS = [
  "etiquetada",
  "inconsistencias",
  "llega",
  "asesor",
] as const;
type PreguntaBot = (typeof PREGUNTAS_VALIDAS)[number];

export async function POST(req: NextRequest) {
  const clienteNombre = await clienteNombreDeLaSesion(req);
  if (!clienteNombre) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { orden_fase_id, pregunta } = await req.json();
  if (!orden_fase_id || !PREGUNTAS_VALIDAS.includes(pregunta)) {
    return NextResponse.json({ error: "Pregunta inválida." }, { status: 400 });
  }

  const { data: fase } = await supabaseAdmin
    .from("portal_ordenes_fases")
    .select("id, cliente_nombre, orden_dap_id, etq_orden_id, fases, fase_actual")
    .eq("id", orden_fase_id)
    .maybeSingle();

  if (!fase || fase.cliente_nombre !== clienteNombre) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Texto de la pregunta tal como se ve en el botón, para guardarla como
  // si el cliente la hubiera escrito.
  const textoPregunta: Record<PreguntaBot, string> = {
    etiquetada: "¿Mi carga está etiquetada?",
    inconsistencias: "¿Mi carga tiene inconsistencias?",
    llega: "¿Cuándo llega mi carga?",
    asesor: "Quiero hablar con un asesor",
  };

  // 1. Guardar la pregunta del cliente
  await supabaseAdmin.from("portal_mensajes").insert({
    orden_fase_id,
    cliente_nombre: clienteNombre,
    autor: "cliente",
    autor_nombre: "Cliente",
    mensaje: textoPregunta[pregunta as PreguntaBot],
    leido: false,
  });

  // 2. Calcular la respuesta automática del bot
  let respuesta = "";

  if (pregunta === "asesor") {
    respuesta =
      "Un asesor de ETYECU revisará tu mensaje y te responderá aquí mismo lo antes posible. Gracias por tu paciencia.";
  } else if (pregunta === "etiquetada" || pregunta === "llega") {
    const faseActualTexto = fase.fases?.[fase.fase_actual] ?? null;
    if (!faseActualTexto) {
      respuesta =
        "Todavía no se ha configurado el seguimiento de esta orden. Un asesor te dará el detalle en breve.";
    } else if (pregunta === "etiquetada") {
      const yaEtiquetada = /etiquetad|entregad|listo/i.test(faseActualTexto);
      respuesta = yaEtiquetada
        ? `Sí, tu carga ya pasó por la fase de etiquetado. Estado actual: "${faseActualTexto}".`
        : `Tu carga aún no llega a la fase de etiquetado. Estado actual: "${faseActualTexto}".`;
    } else {
      respuesta = `Tu carga se encuentra actualmente en la fase: "${faseActualTexto}". Puedes ver el detalle completo de fases arriba en tu seguimiento.`;
    }
  } else if (pregunta === "inconsistencias") {
    if (!fase.etq_orden_id) {
      respuesta = "Esta orden no tiene un proceso de etiquetado asociado, así que no aplica revisión de inconsistencias.";
    } else {
      const { data: items } = await supabaseAdmin
        .from("etq_items")
        .select("cantidad_contada, cantidad_factura")
        .eq("orden_id", fase.etq_orden_id)
        .gt("cantidad_factura", 0);

      const hayInconsistencias = (items ?? []).some(
        (it) => it.cantidad_contada !== it.cantidad_factura
      );
      respuesta = hayInconsistencias
        ? "Sí, tu carga se encuentra actualmente en revisión por inconsistencias. Nuestro equipo la está verificando."
        : "No, tu carga no presenta inconsistencias hasta el momento.";
    }
  }

  // 3. Guardar la respuesta del bot como mensaje del "equipo"
  await supabaseAdmin.from("portal_mensajes").insert({
    orden_fase_id,
    cliente_nombre: clienteNombre,
    autor: "equipo",
    autor_nombre: "ETYECU (respuesta automática)",
    mensaje: respuesta,
    leido: true,
  });

  return NextResponse.json({ ok: true });
}
