import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_sesion")?.value;
  if (!cookie) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const [accesoId] = cookie.split(":");
  const { data: acceso } = await supabaseAdmin
    .from("portal_accesos")
    .select("id, cliente_nombre, activo")
    .eq("id", accesoId)
    .maybeSingle();

  if (!acceso || !acceso.activo) {
    return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
  }

  const clienteNombreParam = req.nextUrl.searchParams.get("cliente_nombre");
  if (clienteNombreParam !== acceso.cliente_nombre) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { data: fasesConfig } = await supabaseAdmin
    .from("portal_ordenes_fases")
    .select("id, orden_dap_id, etq_orden_id, fases, fase_actual, visible")
    .eq("cliente_nombre", acceso.cliente_nombre)
    .eq("visible", true);

  const idsDap = (fasesConfig ?? []).filter((f) => f.orden_dap_id).map((f) => f.orden_dap_id);
  const idsEtq = (fasesConfig ?? []).filter((f) => f.etq_orden_id).map((f) => f.etq_orden_id);

  const [dapRes, etqRes] = await Promise.all([
    idsDap.length > 0
      ? supabaseAdmin.from("ordenes_dap").select("id, numero_dap").in("id", idsDap)
      : Promise.resolve({ data: [] as { id: string; numero_dap: string }[] }),
    idsEtq.length > 0
      ? supabaseAdmin.from("etq_ordenes").select("id, numero_etq").in("id", idsEtq)
      : Promise.resolve({ data: [] as { id: string; numero_etq: string }[] }),
  ]);

  const dapMap = new Map((dapRes.data ?? []).map((o) => [o.id, o.numero_dap]));
  const etqMap = new Map((etqRes.data ?? []).map((o) => [o.id, o.numero_etq]));

  const ordenes = (fasesConfig ?? []).map((f) => ({
    id: f.id,
    tipo: f.orden_dap_id ? "dap" : "etq",
    numero: f.orden_dap_id ? dapMap.get(f.orden_dap_id) ?? "—" : etqMap.get(f.etq_orden_id!) ?? "—",
    fases: f.fases,
    fase_actual: f.fase_actual,
  }));

  return NextResponse.json({ ordenes });
}
