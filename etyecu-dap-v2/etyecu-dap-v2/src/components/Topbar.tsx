import { Flag, Settings } from "lucide-react";

export function Topbar({ userName, userRole }: { userName: string; userRole: string }) {
  return (
    <div className="flex items-center gap-3.5 px-6.5 py-3.5 border-b border-border">
      <input
        placeholder="Buscar orden, cliente o CDA…"
        className="flex-1 max-w-[340px] card px-3 py-2 text-[12.5px] text-text-faint placeholder:text-text-faint outline-none focus:border-border-2"
      />
      <div className="ml-auto flex items-center gap-3.5">
        <button className="w-8 h-8 rounded-[9px] card flex items-center justify-center text-text-dim">
          <Flag size={15} />
        </button>
        <button className="w-8 h-8 rounded-[9px] card flex items-center justify-center text-text-dim">
          <Settings size={15} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
          <div className="leading-tight">
            <p className="text-[12.5px]">{userName}</p>
            <p className="text-[10.5px] text-text-faint">{userRole}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
