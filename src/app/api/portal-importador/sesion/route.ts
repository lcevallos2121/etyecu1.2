import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_sesion")?.value;
  if (!cookie) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  const [accesoId] = cookie.split(":");
  if (!accesoId) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  const { data: acceso } = await supabaseAdmin
    .from("portal_accesos")
    .select("id, cliente_id, activo, clientes(nombre)")
    .eq("id", accesoId)
    .maybeSingle();

  if (!acceso || !acceso.activo) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  return NextResponse.json({
    autenticado: true,
    cliente_id: acceso.cliente_id,
    cliente_nombre: (acceso.clientes as unknown as { nombre: string } | null)?.nombre ?? "",
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("portal_sesion");
  return response;
}
