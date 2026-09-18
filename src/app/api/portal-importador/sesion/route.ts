import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_sesion")?.value;
  if (!cookie) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  const [accesoId] = cookie.split(":");
  if (!accesoId) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  const { data: acceso } = await getSupabaseAdmin()
    .from("portal_accesos")
    .select("id, cliente_nombre, activo")
    .eq("id", accesoId)
    .maybeSingle();

  if (!acceso || !acceso.activo) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  return NextResponse.json({
    autenticado: true,
    cliente_nombre: acceso.cliente_nombre,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("portal_sesion");
  return response;
}
