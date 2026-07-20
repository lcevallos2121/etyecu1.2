import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { KpiCard } from "@/components/KpiCard";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/" />

      <main className="flex-1 min-w-0">
        <Topbar userName="Abigail Cobos" userRole="Gerencia General" />

        <div className="px-6.5 pt-5.5 pb-10">
          <h1 className="text-[21px] font-semibold mb-0.5">Dashboard</h1>
          <p className="text-[12.5px] text-text-faint mb-4.5">
            Resumen de la operación del depósito · Actualizado hace 4 minutos
          </p>

          <div className="flex gap-4.5 items-start">
            <div className="flex-1 min-w-0 flex flex-col gap-4.5">
              <div className="grid grid-cols-3 gap-3.5">
                <KpiCard
                  label="CDAs activos"
                  value="98"
                  delta="6 esta semana"
                  trend="up"
                  iconColor="purple"
                  sparkPoints="0,30 25,26 50,28 75,18 100,20 125,10 150,14 175,6 200,8"
                />
                <KpiCard
                  label="Órdenes en depósito"
                  value="54"
                  delta="12 unidades netas"
                  trend="up"
                  iconColor="teal"
                  sparkPoints="0,20 25,22 50,16 75,20 100,12 125,16 150,8 175,12 200,6"
                />
                <KpiCard
                  label="Novedades sin resolver"
                  value="3"
                  delta="requiere atención"
                  trend="down"
                  iconColor="coral"
                  sparkPoints="0,10 25,14 50,12 75,20 100,18 125,26 150,24 175,30 200,28"
                />
              </div>

              <div className="card p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <h3 className="text-[15px] font-semibold">
                    Orden DAP 2026-089 · Nexus International Holding
                  </h3>
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-accent/[0.18] text-[#c4b8ff]">
                    Régimen 70
                  </span>
                  <span className="ml-auto text-[11px] text-text-faint">
                    Última actualización · hace 40 min
                  </span>
                </div>
                <p className="text-[12px] text-text-dim">Cantidad actual en depósito</p>
                <p className="text-[34px] font-bold tracking-tight my-1 mb-3.5">
                  1,240 <span className="text-[16px] font-normal text-text-faint">unidades</span>
                </p>
                <div className="flex gap-2 mb-4.5">
                  <button className="btn-primary text-[12.5px] font-semibold px-4 py-2 rounded-lg">
                    Registrar egreso
                  </button>
                  <button className="btn-secondary text-[12.5px] font-semibold px-4 py-2 rounded-lg">
                    Ver ubicaciones
                  </button>
                  <button className="btn-secondary text-[12.5px] font-semibold px-4 py-2 rounded-lg">
                    Editar orden
                  </button>
                </div>
              </div>
            </div>

            <div className="w-[300px] shrink-0 flex flex-col gap-4">
              <div className="rounded-[14px] p-5 border border-accent-2/25 bg-gradient-to-br from-[#241e46] to-[#171226]">
                <span className="inline-block text-[10px] font-bold bg-accent-2 text-[#1b1330] px-2 py-0.5 rounded-full mb-3">
                  Próximamente
                </span>
                <h3 className="text-[17px] font-semibold mb-2">Módulo de Etiquetado</h3>
                <p className="text-[12px] text-[#c9c3e6] leading-relaxed mb-4.5">
                  Clasificación con bloqueo de seguridad, inventario multimesa en tiempo real e
                  impresión directa a Zebra.
                </p>
                <button className="btn-primary w-full text-[12.5px] font-semibold py-2 rounded-lg mb-2">
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
