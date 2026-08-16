"use client";

function getPageItems(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("...");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("...");
  items.push(total);
  return items;
}

export default function PaginationBar({
  page,
  pageCount,
  perPage,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
      <p className="text-xs text-on-surface-variant">
        Showing <span className="font-semibold text-on-surface">{from}</span>–
        <span className="font-semibold text-on-surface">{to}</span> of{" "}
        <span className="font-semibold text-on-surface">{total}</span>
      </p>
      {pageCount > 1 && (
      <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 no-scrollbar">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          <span className="hidden sm:inline">Prev</span>
        </button>
        {getPageItems(page, pageCount).map((it, idx) =>
          it === "..." ? (
            <span key={`e${idx}`} className="px-1.5 sm:px-2 text-xs text-on-surface-variant shrink-0">
              …
            </span>
          ) : (
            <button
              key={it}
              onClick={() => onPage(it)}
              className={`min-w-[34px] h-[34px] rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                it === page
                  ? "bg-primary text-white shadow-sm"
                  : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {it}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <span className="hidden sm:inline">Next</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
      )}
    </div>
  );
}