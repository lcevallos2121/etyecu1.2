"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Tag, Building2, Package, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

type EtqOrden = {
  id: string;
  numero_etq: string;
  origen: "etyecu" | "externo";
  cliente_nombre: string | null;
  tipo_producto: string | null;
  estado: "abierta" | "en_proceso" | "cerrada";
  fecha: string;
};

const estadoLabel: Record<string, { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-accent/[0.18] text-[#c4b8ff]" },
  en_proceso: { texto: "En proceso", clase: "bg-amber/15 text-[#fbbf24]" },
  cerrada: { texto: "Cerrada", clase: "bg-green/15 text-[#6ee7b7]" },
};

export default function EtiquetadoPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<EtqOrden[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("etq_ordenes")
      .select("id, numero_etq, origen, cliente_nombre, tipo_producto, estado, fecha")
      .order("creado_en", { ascending: false });
    if (error) {
      setErrorMsg(
        error.message.includes("does not exist") || error.message.includes("relation")
          ? "Falta crear las tablas. ¿Corriste etiquetado_schema.sql en Supabase?"
          : error.message
      );
    } else {
      setOrdenes((data as EtqOrden[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Etiquetado</h1>
              <p className="text-[12.5px] text-text-faint">
                {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} de etiquetado
              </p>
            </div>
            <Link
              href="/etiquetado/nuevo"
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
            >
              <Plus size={15} /> Nueva orden de etiquetado
            </Link>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : ordenes.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-accent/[0.15] flex items-center justify-center mx-auto mb-3">
                <Tag size={22} className="text-[#c4b8ff]" />
              </div>
              <p className="text-[14px] font-medium mb-1">Aún no hay órdenes de etiquetado</p>
              <p className="text-[12.5px] text-text-faint mb-4">
                Crea la primera eligiendo con quién vas a etiquetar.
              </p>
              <Link
                href="/etiquetado/nuevo"
                className="btn-primary inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
              >
                <Plus size={15} /> Nueva orden de etiquetado
              </Link>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[130px_1fr_130px_120px_110px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                <span>N° Etiquetado</span>
                <span>Cliente</span>
                <span>Producto</span>
                <span>Estado</span>
                <span className="text-right">Fecha</span>
              </div>
              {ordenes.map((o) => {
                const est = estadoLabel[o.estado] ?? estadoLabel.abierta;
                return (
                  <Link
                    key={o.id}
                    href={`/etiquetado/${o.id}`}
                    className="grid grid-cols-[130px_1fr_130px_120px_110px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px] hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-medium">{o.numero_etq}</span>
                    <span className="flex items-center gap-1.5 truncate">
                      {o.origen === "etyecu" ? (
                        <Package size={13} className="text-text-faint shrink-0" />
                      ) : (
                        <Building2 size={13} className="text-text-faint shrink-0" />
                      )}
                      <span className="truncate">{o.cliente_nombre ?? "—"}</span>
                    </span>
                    <span className="text-text-dim capitalize">{o.tipo_producto ?? "—"}</span>
                    <span>
                      <span className={`text-[10.5px] px-2 py-0.5 rounded-full ${est.clase}`}>
                        {est.texto}
                      </span>
                    </span>
                    <span className="text-text-dim text-right flex items-center justify-end gap-1">
                      {new Date(o.fecha).toLocaleDateString("es-EC")}
                      <ArrowRight size={13} className="text-text-faint" />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
