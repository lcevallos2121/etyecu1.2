import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  FileText,
  PackagePlus,
  PackageMinus,
  Warehouse,
  AlertTriangle,
  BarChart3,
  UserCog,
  Tag,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeWarn?: boolean;
};

const navGroups: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/cda", label: "CDA", icon: FileText },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/ingreso", label: "Ingreso de carga", icon: PackagePlus },
      { href: "/egreso", label: "Egreso de carga", icon: PackageMinus },
      { href: "/racks", label: "Racks y ubicaciones", icon: Warehouse },
      { href: "/novedades", label: "Novedades", icon: AlertTriangle, badge: "3", badgeWarn: true },
    ],
  },
  {
    label: "Análisis",
    items: [
      { href: "/reportes", label: "Reportes", icon: BarChart3 },
      { href: "/usuarios", label: "Usuarios", icon: UserCog },
    ],
  },
  {
    label: "Próximamente",
    items: [{ href: "/etiquetado", label: "Etiquetado", icon: Tag, badge: "Fase 2" }],
  },
];

export function Sidebar({ activePath = "/" }: { activePath?: string }) {
  return (
    <aside className="w-[236px] shrink-0 bg-panel border-r border-border p-3.5 flex flex-col gap-5 min-h-screen">
      <div className="flex items-center gap-2.5 px-2">
        <div className="w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center font-bold text-sm">
          E
        </div>
        <div className="leading-tight">
          <p className="text-[14.5px] font-semibold">Etyecu DAP</p>
          <p className="text-[11px] text-text-faint">Depósito aduanero</p>
        </div>
      </div>

      {navGroups.map((group, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {group.label && (
            <p className="text-[10.5px] uppercase tracking-wider text-text-faint px-2.5 pt-2.5 pb-1">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-[13.5px] transition-colors ${
                  active
                    ? "bg-accent/[0.13] text-white"
                    : "text-text-dim hover:bg-white/[0.03] hover:text-text"
                }`}
              >
                {active && (
                  <span className="absolute -left-3.5 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
                )}
                <Icon size={16} className="opacity-85 shrink-0" />
                {item.label}
                {item.badge && (
                  <span
                    className={`ml-auto text-[10.5px] px-1.5 py-0.5 rounded-full ${
                      item.badgeWarn
                        ? "bg-red/[0.18] text-red-300"
                        : "bg-white/[0.08] text-text-dim"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto card p-3 flex flex-col gap-2">
        <p className="text-[12.5px] font-semibold">Módulo de Etiquetado</p>
        <p className="text-[11px] text-text-faint leading-snug">
          Clasificación, inventario multimesa e impresión Zebra. Disponible al cerrar esta fase.
        </p>
        <button className="btn-primary text-[12px] font-semibold py-1.5 rounded-lg">
          Ver hoja de ruta
        </button>
      </div>
    </aside>
  );
}
