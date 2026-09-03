import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function clienteIdDeLaSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("portal_sesion")?.value;
  if (!cookie) return null;
  const [accesoId] = cookie.split(":");
  const { data: acceso } = await supabaseAdmin
    .from("portal_accesos")
    .select("id, cliente_id, activo, usuario")
    .eq("id", accesoId)
    .maybeSingle();
  if (!acceso || !acceso.activo) return null;
  return acceso.cliente_id;
}

export async function GET(req: NextRequest) {
  const clienteId = await clienteIdDeLaSesion(req);
  if (!clienteId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const ordenFaseId = req.nextUrl.searchParams.get("orden_fase_id");
  if (!ordenFaseId) {
    return NextResponse.json({ error: "orden_fase_id es requerido." }, { status: 400 });
  }

  const { data: orden } = await supabaseAdmin
    .from("portal_ordenes_fases")
    .select("id, cliente_id")
    .eq("id", ordenFaseId)
    .maybeSingle();
  if (!orden || orden.cliente_id !== clienteId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { data: mensajes } = await supabaseAdmin
    .from("portal_mensajes")
    .select("id, autor, autor_nombre, mensaje, foto_url, creado_en")
    .eq("orden_fase_id", ordenFaseId)
    .order("creado_en", { ascending: true });

  return NextResponse.json({ mensajes: mensajes ?? [] });
}

export async function POST(req: NextRequest) {
  const clienteId = await clienteIdDeLaSesion(req);
  if (!clienteId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { orden_fase_id, mensaje, foto_url } = await req.json();
  if (!orden_fase_id || (!mensaje?.trim() && !foto_url)) {
    return NextResponse.json({ error: "Escribe un mensaje o adjunta una foto." }, { status: 400 });
  }

  const { data: orden } = await supabaseAdmin
    .from("portal_ordenes_fases")
    .select("id, cliente_id, orden_dap_id, etq_orden_id")
    .eq("id", orden_fase_id)
    .maybeSingle();
  if (!orden || orden.cliente_id !== clienteId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const cookie = req.cookies.get("portal_sesion")!.value;
  const [accesoId] = cookie.split(":");
  const { data: acceso } = await supabaseAdmin
    .from("portal_accesos")
    .select("usuario")
    .eq("id", accesoId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("portal_mensajes").insert({
    orden_fase_id,
    cliente_id: clienteId,
    autor: "cliente",
    autor_nombre: acceso?.usuario ?? "Cliente",
    mensaje: mensaje?.trim() || null,
    foto_url: foto_url || null,
    leido: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notificar por correo a los destinatarios configurados. Nunca bloquea
  // ni hace fallar la respuesta al cliente si el envío falla — el mensaje
  // ya quedó guardado, el correo es un "extra" de conveniencia.
  notificarPorCorreo({
    ordenDapId: orden.orden_dap_id,
    etqOrdenId: orden.etq_orden_id,
    clienteId,
    autorNombre: acceso?.usuario ?? "Cliente",
    mensaje: mensaje?.trim() || null,
    tieneAdjunto: !!foto_url,
  }).catch((err) => console.error("Error notificando por correo:", err));

  return NextResponse.json({ ok: true });
}

async function notificarPorCorreo(datos: {
  ordenDapId: string | null;
  etqOrdenId: string | null;
  clienteId: string;
  autorNombre: string;
  mensaje: string | null;
  tieneAdjunto: boolean;
}) {
  if (!resend) return; // sin RESEND_API_KEY configurada, no se envía nada

  const { data: destinatarios } = await supabaseAdmin
    .from("portal_notificaciones_correos")
    .select("correo")
    .eq("activo", true);

  if (!destinatarios || destinatarios.length === 0) return;

  const [{ data: cliente }, { data: ordenDap }, { data: etqOrden }] = await Promise.all([
    supabaseAdmin.from("clientes").select("nombre").eq("id", datos.clienteId).maybeSingle(),
    datos.ordenDapId
      ? supabaseAdmin.from("ordenes_dap").select("numero_dap").eq("id", datos.ordenDapId).maybeSingle()
      : Promise.resolve({ data: null }),
    datos.etqOrdenId
      ? supabaseAdmin.from("etq_ordenes").select("numero_etq").eq("id", datos.etqOrdenId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const numeroOrden = ordenDap?.numero_dap ?? etqOrden?.numero_etq ?? "—";
  const cuerpoMensaje = datos.mensaje || (datos.tieneAdjunto ? "(envió una foto)" : "");

  await resend.emails.send({
    from: "onboarding@resend.dev",
    to: destinatarios.map((d) => d.correo),
    subject: `Nuevo mensaje de ${cliente?.nombre ?? "un cliente"} — Orden ${numeroOrden}`,
    html: `
      <p><strong>${cliente?.nombre ?? "Cliente"}</strong> (usuario: ${datos.autorNombre}) escribió en el chat de la orden <strong>${numeroOrden}</strong>:</p>
      <blockquote style="border-left:3px solid #7c6cf0;padding-left:12px;color:#333;">${cuerpoMensaje}</blockquote>
      <p style="color:#888;font-size:12px;">Ingresa al panel de Tracking Importadores en el sistema ETYECU DAP para responder.</p>
    `,
  });
}
