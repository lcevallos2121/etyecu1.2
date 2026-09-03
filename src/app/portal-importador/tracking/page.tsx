"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Package, Tag, CheckCircle2, MessageCircle, X, Send, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type OrdenTracking = {
  id: string;
  tipo: "dap" | "etq";
  numero: string;
  fases: string[];
  fase_actual: number;
};

type Mensaje = {
  id: string;
  autor: "cliente" | "equipo";
  autor_nombre: string | null;
  mensaje: string | null;
  foto_url: string | null;
  creado_en: string;
};

export default function PortalTrackingPage() {
  const router = useRouter();
  const [clienteNombre, setClienteNombre] = useState("");
  const [ordenes, setOrdenes] = useState<OrdenTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOrdenId, setChatOrdenId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const sesionRes = await fetch("/api/portal-importador/sesion");
    if (!sesionRes.ok) {
      router.push("/portal-importador/login");
      return;
    }
    const sesion = await sesionRes.json();
    setClienteNombre(sesion.cliente_nombre ?? "");

    const ordenesRes = await fetch(
      `/api/portal-importador/ordenes?cliente_id=${sesion.cliente_id}`
    );
    if (ordenesRes.ok) {
      const data = await ordenesRes.json();
      setOrdenes(data.ordenes ?? []);
    } else {
      setError("No se pudieron cargar tus órdenes en este momento.");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cerrarSesion() {
    await fetch("/api/portal-importador/sesion", { method: "DELETE" });
    router.push("/portal-importador/login");
  }

  const ordenDelChat = ordenes.find((o) => o.id === chatOrdenId) ?? null;

  return (
    <div className="min-h-screen bg-[#0f0e17]">
      <header className="border-b border-[#2a2836] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-etyecu-blanco.png" alt="ETYECU" className="h-8" />
          <div className="w-px h-6 bg-[#2a2836]" />
          <p className="text-[13.5px] text-white font-medium">{clienteNombre}</p>
        </div>
        <button
          onClick={cerrarSesion}
          className="flex items-center gap-1.5 text-[12.5px] text-[#8b8a9a] hover:text-white transition-colors"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
      </header>

      <main className="max-w-[720px] mx-auto px-5 py-8">
        <h1 className="text-[22px] font-semibold text-white mb-1">Estado de tu carga</h1>
        <p className="text-[13px] text-[#8b8a9a] mb-7">
          Aquí puedes ver el avance de cada una de tus órdenes en tiempo real.
        </p>

        {loading ? (
          <p className="text-[13px] text-[#8b8a9a]">Cargando…</p>
        ) : error ? (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
            {error}
          </div>
        ) : ordenes.length === 0 ? (
          <div className="bg-[#17151f] border border-[#2a2836] rounded-2xl p-8 text-center">
            <p className="text-[13.5px] text-[#8b8a9a]">
              Todavía no tienes órdenes con seguimiento habilitado. Contacta a tu asesor en ETYECU
              si esperas ver una carga aquí.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {ordenes.map((o) => (
              <TarjetaOrden key={o.id} orden={o} onAbrirChat={() => setChatOrdenId(o.id)} />
            ))}
          </div>
        )}
      </main>

      {ordenDelChat && (
        <ModalChat orden={ordenDelChat} onCerrar={() => setChatOrdenId(null)} />
      )}
    </div>
  );
}

function TarjetaOrden({
  orden,
  onAbrirChat,
}: {
  orden: OrdenTracking;
  onAbrirChat: () => void;
}) {
  const completa = orden.fase_actual >= orden.fases.length - 1;
  return (
    <div className="bg-[#17151f] border border-[#2a2836] rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-5">
        {orden.tipo === "etq" ? (
          <Tag size={16} className="text-[#c4b8ff]" />
        ) : (
          <Package size={16} className="text-[#c4b8ff]" />
        )}
        <p className="text-[14.5px] font-semibold text-white">{orden.numero}</p>
        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#7c6cf0]/[0.18] text-[#c4b8ff]">
          {orden.tipo === "etq" ? "Etiquetado" : "Depósito Aduanero"}
        </span>
        {completa && (
          <span className="flex items-center gap-1 text-[11.5px] text-[#6ee7b7]">
            <CheckCircle2 size={13} /> Completado
          </span>
        )}
        <button
          onClick={onAbrirChat}
          className="ml-auto flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-lg bg-[#7c6cf0]/[0.15] text-[#c4b8ff] hover:bg-[#7c6cf0]/[0.25] transition-colors"
        >
          <MessageCircle size={13} /> Chat
        </button>
      </div>

      {orden.fases.length === 0 ? (
        <p className="text-[12.5px] text-[#5c5a6b] italic">
          El seguimiento de esta orden se habilitará en breve.
        </p>
      ) : (
        <div className="flex items-start">
          {orden.fases.map((fase, i) => {
            const hecha = i < orden.fase_actual;
            const actual = i === orden.fase_actual;
            return (
              <div key={i} className="flex-1 flex flex-col items-center relative">
                {i > 0 && (
                  <div
                    className={`absolute top-[11px] right-1/2 w-full h-[2px] -z-0 ${
                      i <= orden.fase_actual ? "bg-[#7c6cf0]" : "bg-[#2a2836]"
                    }`}
                  />
                )}
                <div
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center z-10 shrink-0 ${
                    hecha
                      ? "bg-[#7c6cf0]"
                      : actual
                      ? "bg-[#7c6cf0] ring-4 ring-[#7c6cf0]/20"
                      : "bg-[#2a2836]"
                  }`}
                >
                  {hecha && <CheckCircle2 size={13} className="text-white" />}
                  {actual && <span className="w-[7px] h-[7px] rounded-full bg-white" />}
                </div>
                <p
                  className={`text-[10.5px] text-center mt-2 px-1 leading-tight ${
                    actual ? "text-white font-semibold" : hecha ? "text-[#c4b8ff]" : "text-[#5c5a6b]"
                  }`}
                >
                  {fase}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModalChat({ orden, onCerrar }: { orden: OrdenTracking; onCerrar: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargarMensajes = useCallback(async () => {
    const res = await fetch(`/api/portal-importador/mensajes?orden_fase_id=${orden.id}`);
    if (res.ok) {
      const data = await res.json();
      setMensajes(data.mensajes ?? []);
    }
  }, [orden.id]);

  useEffect(() => {
    cargarMensajes();
    // Refresco cada 8 segundos mientras el chat está abierto, para simular
    // "tiempo real" sin necesitar websockets.
    const intervalo = setInterval(cargarMensajes, 8000);
    return () => clearInterval(intervalo);
  }, [cargarMensajes]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  async function enviarMensaje(fotoUrl?: string) {
    if (!texto.trim() && !fotoUrl) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal-importador/mensajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden_fase_id: orden.id, mensaje: texto, foto_url: fotoUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar el mensaje.");
        return;
      }
      setTexto("");
      cargarMensajes();
    } finally {
      setEnviando(false);
    }
  }

  // Envía una de las preguntas rápidas del bot: guarda la pregunta como si
  // el cliente la hubiera escrito, y el servidor calcula y guarda la
  // respuesta automática al instante.
  async function enviarPreguntaBot(pregunta: "etiquetada" | "inconsistencias" | "llega" | "asesor") {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal-importador/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden_fase_id: orden.id, pregunta }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar la pregunta.");
        return;
      }
      cargarMensajes();
    } finally {
      setEnviando(false);
    }
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imágenes.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("La imagen no puede superar 15MB.");
      return;
    }
    setSubiendoFoto(true);
    setError(null);
    try {
      // Sube DIRECTO a Supabase Storage desde el navegador (no pasa por
      // ninguna Route Handler de Next.js), así una foto grande de celular
      // nunca choca con el límite de tamaño de body del servidor.
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const nombreArchivo = `${crypto.randomUUID()}.${ext}`;
      const { error: errorSubida } = await supabase.storage
        .from("portal-chat-fotos")
        .upload(nombreArchivo, file, { contentType: file.type });
      if (errorSubida) {
        setError(errorSubida.message);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("portal-chat-fotos")
        .getPublicUrl(nombreArchivo);
      await enviarMensaje(urlData.publicUrl);
    } finally {
      setSubiendoFoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-[#17151f] border border-[#2a2836] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-[480px] h-[85vh] sm:h-[600px] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2836]">
          <div>
            <p className="text-[14px] font-semibold text-white">{orden.numero}</p>
            <p className="text-[11.5px] text-[#8b8a9a]">Chat con ETYECU</p>
          </div>
          <button onClick={onCerrar} className="text-[#8b8a9a] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {mensajes.length === 0 ? (
            <p className="text-[12.5px] text-[#5c5a6b] text-center mt-8">
              Escribe tu primera consulta sobre esta orden.
            </p>
          ) : (
            mensajes.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                  m.autor === "cliente"
                    ? "self-end bg-[#7c6cf0] text-white"
                    : "self-start bg-[#232130] text-[#e5e4ea]"
                }`}
              >
                {m.autor === "equipo" && (
                  <p className="text-[10.5px] text-[#c4b8ff] font-semibold mb-0.5">
                    {m.autor_nombre ?? "ETYECU"}
                  </p>
                )}
                {m.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.foto_url}
                    alt="Foto adjunta"
                    className="rounded-lg mb-1.5 max-w-full max-h-[220px] object-cover"
                  />
                )}
                {m.mensaje && <p className="text-[13px] leading-snug">{m.mensaje}</p>}
                <p className="text-[9.5px] opacity-60 mt-1">
                  {new Date(m.creado_en).toLocaleString("es-EC", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))
          )}
          <div ref={finRef} />
        </div>

        {/* Botones de respuesta rápida del bot: siempre visibles arriba
            del campo de texto. "¿Mi carga tiene inconsistencias?" solo
            aparece si la orden es de etiquetado (no aplica a DAP puro). */}
        <div className="px-4 pt-2 flex flex-wrap gap-1.5 border-t border-[#2a2836]">
          <button
            type="button"
            onClick={() => enviarPreguntaBot("etiquetada")}
            disabled={enviando}
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-[#232130] text-[#c4b8ff] hover:bg-[#2c2940] disabled:opacity-50"
          >
            ¿Mi carga está etiquetada?
          </button>
          {orden.tipo === "etq" && (
            <button
              type="button"
              onClick={() => enviarPreguntaBot("inconsistencias")}
              disabled={enviando}
              className="text-[11px] px-2.5 py-1.5 rounded-full bg-[#232130] text-[#c4b8ff] hover:bg-[#2c2940] disabled:opacity-50"
            >
              ¿Mi carga tiene inconsistencias?
            </button>
          )}
          <button
            type="button"
            onClick={() => enviarPreguntaBot("llega")}
            disabled={enviando}
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-[#232130] text-[#c4b8ff] hover:bg-[#2c2940] disabled:opacity-50"
          >
            ¿Cuándo llega mi carga?
          </button>
          <button
            type="button"
            onClick={() => enviarPreguntaBot("asesor")}
            disabled={enviando}
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-[#7c6cf0]/[0.18] text-white hover:bg-[#7c6cf0]/[0.3] disabled:opacity-50"
          >
            Hablar con un asesor
          </button>
        </div>

        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <div className="px-4 py-3 border-t border-[#2a2836] flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={subirFoto}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendoFoto}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#232130] text-[#8b8a9a] hover:text-white disabled:opacity-50"
            title="Adjuntar foto"
          >
            <ImageIcon size={16} />
          </button>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarMensaje();
              }
            }}
            placeholder="Escribe tu mensaje…"
            className="flex-1 bg-[#0f0e17] border border-[#2a2836] rounded-full px-4 py-2 text-[13px] text-white outline-none focus:border-[#7c6cf0]"
          />
          <button
            onClick={() => enviarMensaje()}
            disabled={enviando || !texto.trim()}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#7c6cf0] text-white disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
