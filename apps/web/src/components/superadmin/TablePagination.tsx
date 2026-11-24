'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export default function TablePagination({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 25],
  itemLabel = 'registros',
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, totalItems);

  // Ventana compacta de páginas visibles
  const pages: number[] = [];
  const maxButtons = 5;
  let startPage = Math.max(1, safePage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let p = startPage; p <= endPage; p++) {
    pages.push(p);
  }

  return (
    <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="tabular-nums">
          Mostrando <strong className="text-slate-900">{startIndex}–{endIndex}</strong> de{' '}
          <strong className="text-slate-900">{totalItems}</strong> {itemLabel}
        </span>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Filas:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="h-7 bg-white border border-slate-200 rounded-lg px-2 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-slate-400"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
              p === safePage
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Página siguiente"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
