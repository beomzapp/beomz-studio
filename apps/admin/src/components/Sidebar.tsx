import { NavLink } from "react-router-dom";
import { Users, Hammer, Coins, Map, LayoutGrid } from "lucide-react";

const navItems = [
  { to: "/users", label: "Users", icon: Users },
  { to: "/builds", label: "Builds", icon: Hammer },
  { to: "/credits", label: "Credits", icon: Coins },
  { to: "/heatmap", label: "Heatmap", icon: Map },
  { to: "/modules", label: "Modules", icon: LayoutGrid },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <span className="text-sm font-semibold text-slate-800">Admin</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-orange-50 text-orange-600 font-medium"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
