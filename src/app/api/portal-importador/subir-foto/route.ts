import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_sesion")?.value;
  if (!cookie) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const [accesoId] = cookie.split(":");
  const { data: acceso } = await getSupabaseAdmin()
    .from("portal_accesos")
    .select("id, activo")
    .eq("id", accesoId)
    .maybeSingle();
  if (!acceso || !acceso.activo) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Solo se permiten imágenes." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "La imagen no puede superar 8MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const nombreArchivo = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await getSupabaseAdmin().storage
    .from("portal-chat-fotos")
    .upload(nombreArchivo, buffer, { contentType: file.type });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: urlData } = getSupabaseAdmin().storage
    .from("portal-chat-fotos")
    .getPublicUrl(nombreArchivo);

  return NextResponse.json({ ok: true, url: urlData.publicUrl });
}
