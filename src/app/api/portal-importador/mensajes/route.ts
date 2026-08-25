import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    .select("id, cliente_id")
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

  return NextResponse.json({ ok: true });
}
