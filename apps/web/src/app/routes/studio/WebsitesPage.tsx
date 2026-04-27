import { Globe, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function WebsitesPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#faf9f6] p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white">
        <Globe size={28} className="text-[#F97316]" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-[#1a1a1a]">Websites</h1>
      <p className="mt-2 text-sm text-[#6b7280]">
        AI-powered website builder — create your first site
      </p>
      <Link
        to="/studio/websites/new"
        className="mt-6 flex items-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
      >
        <Plus size={16} />
        New website
      </Link>
    </div>
  );
}
