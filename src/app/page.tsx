"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";

export const dynamic = "force-dynamic";

type OrdenReciente = {
  numero_dap: string;
  regimen: string;
  tipo_carga_regimen: string | null;
  cantidad_actual: number;
  actualizado_en: string | null;
  creado_en: string;
  clientes: { nombre: string } | null;
  cdas: { clientes: { nombre: string } | null } | null;
};

export default function DashboardPage() {
  const supabase = createClient();

  const [cdasActivos, setCdasActivos] = useState(0);
  const [ordenesEnDeposito, setOrdenesEnDeposito] = useState(0);
  const [unidadesEnDeposito, setUnidadesEnDeposito] = useState(0);
  const [novedadesPend, setNovedadesPend] = useState(0);
  const [ordenReciente, setOrdenReciente] = useState<OrdenReciente | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const [cdasRes, ordenesRes, novedadesRes, recienteRes] = await Promise.all([
      supabase.from("cdas").select("id", { count: "exact", head: true }),
      supabase.from("ordenes_dap").select("cantidad_actual"),
      supabase.from("novedades").select("id", { count: "exact", head: true }).eq("resuelto", false),
      supabase
        .from("ordenes_dap")
        .select("numero_dap, regimen, tipo_carga_regimen, cantidad_actual, actualizado_en, creado_en, clientes(nombre), cdas(clientes(nombre))")
        .gt("cantidad_actual", 0)
        .order("actualizado_en", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setCdasActivos(cdasRes.count ?? 0);

    const ordenes = ordenesRes.data ?? [];
    setOrdenesEnDeposito(ordenes.filter((o) => o.cantidad_actual > 0).length);
    setUnidadesEnDeposito(ordenes.reduce((a, o) => a + (o.cantidad_actual ?? 0), 0));

    setNovedadesPend(novedadesRes.count ?? 0);
    setOrdenReciente((recienteRes.data as unknown as OrdenReciente) ?? null);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function tiempoRelativo(fecha: string | null) {
    if (!fecha) return "—";
    const diff = Date.now() - new Date(fecha).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "hace instantes";
    if (min < 60) return `hace ${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `hace ${horas} h`;
    return `hace ${Math.floor(horas / 24)} días`;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <h1 className="text-[21px] font-semibold mb-0.5">Dashboard</h1>
          <p className="text-[12.5px] text-text-faint mb-4.5">
            Resumen de la operación del depósito
          </p>

          <div className="flex gap-4.5 items-start">
            <div className="flex-1 min-w-0 flex flex-col gap-4.5">
              <div className="grid grid-cols-3 gap-3.5">
                <Kpi
                  label="CDAs activos"
                  value={loading ? "…" : cdasActivos.toString()}
                  color="purple"
                  href="/cda"
                />
                <Kpi
                  label="Órdenes en depósito"
                  value={loading ? "…" : ordenesEnDeposito.toString()}
                  color="teal"
                  href="/ingreso"
                />
                <Kpi
                  label="Novedades sin resolver"
                  value={loading ? "…" : novedadesPend.toString()}
                  color="coral"
                  href="/novedades"
                  alerta={novedadesPend > 0}
                />
              </div>

              {ordenReciente ? (
                <div className="card p-5">
                  <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                    <h3 className="text-[15px] font-semibold">
                      Orden DAP {ordenReciente.numero_dap} ·{" "}
                      {ordenReciente.clientes?.nombre ?? ordenReciente.cdas?.clientes?.nombre ?? "—"}
                    </h3>
                    <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-accent/[0.18] text-[#c4b8ff]">
                      {ordenReciente.tipo_carga_regimen === "carga_general"
                        ? "Carga General"
                        : ordenReciente.tipo_carga_regimen === "70" || ordenReciente.regimen === "70"
                        ? "Régimen 70"
                        : "Régimen 10"}
                    </span>
                    <span className="ml-auto text-[11px] text-text-faint">
                      Última actualización · {tiempoRelativo(ordenReciente.actualizado_en ?? ordenReciente.creado_en)}
                    </span>
                  </div>
                  <p className="text-[12px] text-text-dim">Cantidad actual en depósito</p>
                  <p className="text-[34px] font-bold tracking-tight my-1 mb-3.5">
                    {ordenReciente.cantidad_actual.toLocaleString("es-EC")}{" "}
                    <span className="text-[16px] font-normal text-text-faint">unidades</span>
                  </p>
                  <div className="flex gap-2">
                    <Link
                      href="/egreso"
                      className="btn-primary text-[12.5px] font-semibold px-4 py-2 rounded-lg"
                    >
                      Registrar egreso
                    </Link>
                    <Link
                      href="/racks"
                      className="btn-secondary text-[12.5px] font-semibold px-4 py-2 rounded-lg"
                    >
                      Ver ubicaciones
                    </Link>
                    <Link
                      href="/ingreso"
                      className="btn-secondary text-[12.5px] font-semibold px-4 py-2 rounded-lg"
                    >
                      Ver órdenes
                    </Link>
                  </div>
                </div>
              ) : (
                !loading && (
                  <div className="card p-5">
                    <p className="text-[13px] text-text-faint">
                      No hay órdenes con carga en depósito todavía. Registra un ingreso para empezar.
                    </p>
                  </div>
                )
              )}
            </div>

            <div className="w-[300px] shrink-0">
              <div className="rounded-[14px] p-5 border border-accent-2/25 bg-gradient-to-br from-[#241e46] to-[#171226]">
                <span className="inline-block text-[10px] font-bold bg-accent-2 text-[#1b1330] px-2 py-0.5 rounded-full mb-3">
                  Próximamente
                </span>
                <h3 className="text-[17px] font-semibold mb-2">Módulo de Etiquetado</h3>
                <p className="text-[12px] text-[#c9c3e6] leading-relaxed mb-4.5">
                  Clasificación con bloqueo de seguridad, inventario multimesa en tiempo real e
                  impresión directa a Zebra.
                </p>
                <button className="btn-primary w-full text-[12.5px] font-semibold py-2 rounded-lg">
                  Ver plan de etiquetado
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
  href,
  alerta,
}: {
  label: string;
  value: string;
  color: "purple" | "teal" | "coral";
  href: string;
  alerta?: boolean;
}) {
  const iconBg = {
    purple: "bg-accent/[0.18] text-[#c4b8ff]",
    teal: "bg-green/[0.16] text-[#6ee7b7]",
    coral: "bg-red/[0.16] text-[#fca5a5]",
  };
  return (
    <Link href={href} className="card p-4 hover:border-border-2 transition-colors block">
      <div className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[13px] mb-3.5 ${iconBg[color]}`}>
        ◆
      </div>
      <p className="text-[12px] text-text-dim">{label}</p>
      <p className="text-[22px] font-semibold mt-0.5">
        {value}
        {alerta && <span className="ml-2 text-[11px] text-[#fca5a5]">requiere atención</span>}
      </p>
    </Link>
  );
}
