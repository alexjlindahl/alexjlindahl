import { categoryOf } from "@/lib/taxonomy";

export function ToolTag({ name, category, title }: { name: string; category: string; title?: string }) {
  const c = categoryOf(category);
  return (
    <span
      title={title ?? c.label}
      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold"
      style={{ background: c.bg, color: c.fg }}
    >
      {name}
    </span>
  );
}

export function CategoryTag({ category }: { category: string }) {
  const c = categoryOf(category);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}
