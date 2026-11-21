import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Minus,
  PackageCheck,
  Plus,
} from 'lucide-react';
import {
  TransactionLog,
  Van,
  VanInventoryItem,
  getDeficitQty,
  getStockBadgeStyle,
  getStockStatus,
} from '../../types/inventory';

interface RestockQueueSectionProps {
  vans: Van[];
  inventory: VanInventoryItem[];
  logs: TransactionLog[];
  onConfirmRestock: (partId: string, restockQty?: number) => void;
}

export function RestockQueueSection({
  vans,
  inventory,
  logs,
  onConfirmRestock,
}: RestockQueueSectionProps) {
  const [partialQtyByPartId, setPartialQtyByPartId] = useState<
    Record<string, number>
  >({});

  const restockQueue = useMemo(() => {
    const vanMap = new Map(vans.map((v) => [v.id, v]));

    return inventory
      .filter((item) => getDeficitQty(item) > 0)
      .map((item) => {
        const van = vanMap.get(item.vanId);
        const deficit = getDeficitQty(item);
        const relatedPendingLogs = logs
          .filter(
            (log) =>
              log.vanId === item.vanId &&
              log.partId === item.id &&
              log.type === 'CONSUME' &&
              log.status === 'PENDING_CLAIM'
          )
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        const customerRefs = Array.from(
          new Set(relatedPendingLogs.map((l) => l.customerRef).filter(Boolean))
        );

        return {
          item,
          vanName: van?.name ?? 'Unknown Van',
          plateNumber: van?.plateNumber ?? '',
          deficit,
          customerRefs,
        };
      })
      .sort((a, b) => {
        if (a.item.currentQty === 0 && b.item.currentQty > 0) return -1;
        if (b.item.currentQty === 0 && a.item.currentQty > 0) return 1;
        return b.deficit - a.deficit;
      });
  }, [inventory, vans, logs]);

  const getSelectedQty = (partId: string, deficit: number): number => {
    const stored = partialQtyByPartId[partId];
    if (stored === undefined) return deficit;
    return Math.max(1, Math.min(deficit, stored));
  };

  const setSelectedQty = (partId: string, nextQty: number, deficit: number) => {
    const clamped = Math.max(1, Math.min(deficit, Math.floor(nextQty)));
    setPartialQtyByPartId((prev) => ({ ...prev, [partId]: clamped }));
  };

  const handlePartialRestock = (partId: string, qty: number) => {
    onConfirmRestock(partId, qty);
    setPartialQtyByPartId((prev) => {
      const next = { ...prev };
      delete next[partId];
      return next;
    });
  };

  const handleFillToPar = (partId: string) => {
    onConfirmRestock(partId);
    setPartialQtyByPartId((prev) => {
      const next = { ...prev };
      delete next[partId];
      return next;
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList
              className="w-5 h-5 text-blue-700"
              aria-hidden="true"
            />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Restock & Claim Queue
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Parts currently below par level across the fleet requiring full or partial warehouse replenishment.
          </p>
        </div>
        <span className="text-xs font-mono font-medium text-slate-600 tabular-nums">
          {restockQueue.length} {restockQueue.length === 1 ? 'item' : 'items'}{' '}
          queued
        </span>
      </div>

      {restockQueue.length === 0 ? (
        <div className="p-10 text-center">
          <CheckCircle2
            className="w-9 h-9 text-emerald-600 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-base font-semibold text-slate-900">
            All service vans are at 100% par level
          </p>
          <p className="text-sm text-slate-500 mt-1">
            No pending technician claims or missing spare parts right now.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">Van Name</th>
                  <th className="py-3 px-4">Part Name (SKU)</th>
                  <th className="py-3 px-4">Current / Target</th>
                  <th className="py-3 px-4">To Restock</th>
                  <th className="py-3 px-4">Related Customer Refs</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {restockQueue.map(
                  ({ item, vanName, plateNumber, deficit, customerRefs }) => {
                    const badgeClass = getStockBadgeStyle(getStockStatus(item));
                    const selectedQty = getSelectedQty(item.id, deficit);
                    const isPartial = selectedQty < deficit;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-4 px-6 align-middle">
                          <p className="font-semibold text-slate-900">
                            {vanName}
                          </p>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            {plateNumber}
                          </p>
                        </td>
                        <td className="py-4 px-4 align-middle">
                          <p className="font-semibold text-slate-900">
                            {item.partName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono">{item.sku}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{item.category}</span>
                          </p>
                        </td>
                        <td className="py-4 px-4 align-middle">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold tabular-nums whitespace-nowrap ${badgeClass}`}
                          >
                            {item.currentQty} / {item.targetQty}
                          </span>
                        </td>
                        <td className="py-4 px-4 align-middle">
                          <span className="font-mono font-semibold text-rose-700 tabular-nums whitespace-nowrap">
                            +{deficit} {deficit === 1 ? 'unit' : 'units'}
                          </span>
                        </td>
                        <td className="py-4 px-4 align-middle max-w-xs">
                          {customerRefs.length > 0 ? (
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {customerRefs.join(' · ')}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400">
                              Par level adjustment
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-6 align-middle text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {deficit > 1 && (
                              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
                                <button
                                  type="button"
                                  disabled={selectedQty <= 1}
                                  onClick={() =>
                                    setSelectedQty(
                                      item.id,
                                      selectedQty - 1,
                                      deficit
                                    )
                                  }
                                  aria-label={`Decrease restock quantity for ${item.partName}`}
                                  className="min-w-[36px] min-h-[42px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={deficit}
                                  value={selectedQty}
                                  onChange={(e) => {
                                    const parsed = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(parsed)) {
                                      setSelectedQty(item.id, parsed, deficit);
                                    }
                                  }}
                                  aria-label={`Partial restock quantity for ${item.partName}`}
                                  className="w-10 text-center font-mono text-xs font-semibold text-slate-900 tabular-nums border-x border-slate-200 py-2 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  disabled={selectedQty >= deficit}
                                  onClick={() =>
                                    setSelectedQty(
                                      item.id,
                                      selectedQty + 1,
                                      deficit
                                    )
                                  }
                                  aria-label={`Increase restock quantity for ${item.partName}`}
                                  className="min-w-[36px] min-h-[42px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                {isPartial && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePartialRestock(item.id, selectedQty)
                                    }
                                    className="min-h-[42px] px-3 border-l border-slate-300 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                  >
                                    Restock +{selectedQty}
                                  </button>
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => handleFillToPar(item.id)}
                              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.98] text-white text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                            >
                              <PackageCheck className="w-4 h-4 shrink-0" />
                              <span>Fill to Par</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Queue Cards */}
          <div className="md:hidden divide-y divide-slate-200">
            {restockQueue.map(
              ({ item, vanName, plateNumber, deficit, customerRefs }) => {
                const badgeClass = getStockBadgeStyle(getStockStatus(item));
                const selectedQty = getSelectedQty(item.id, deficit);
                const isPartial = selectedQty < deficit;

                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-slate-500">
                          {vanName} ·{' '}
                          <span className="font-mono">{plateNumber}</span>
                        </p>
                        <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                          {item.partName}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono">{item.sku}</span> ·{' '}
                          {item.category}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold tabular-nums whitespace-nowrap shrink-0 ${badgeClass}`}
                      >
                        {item.currentQty} / {item.targetQty}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-slate-500">To Restock</span>
                      <span className="font-mono font-semibold text-rose-700 tabular-nums">
                        +{deficit} {deficit === 1 ? 'unit' : 'units'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-500">
                        Customer Refs:{' '}
                      </span>
                      {customerRefs.length > 0
                        ? customerRefs.join(' · ')
                        : 'Par level adjustment'}
                    </div>

                    {deficit > 1 && (
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shrink-0">
                          <button
                            type="button"
                            disabled={selectedQty <= 1}
                            onClick={() =>
                              setSelectedQty(item.id, selectedQty - 1, deficit)
                            }
                            aria-label={`Decrease restock quantity for ${item.partName}`}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-9 text-center font-mono text-sm font-semibold text-slate-900 tabular-nums">
                            {selectedQty}
                          </span>
                          <button
                            type="button"
                            disabled={selectedQty >= deficit}
                            onClick={() =>
                              setSelectedQty(item.id, selectedQty + 1, deficit)
                            }
                            aria-label={`Increase restock quantity for ${item.partName}`}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        {isPartial && (
                          <button
                            type="button"
                            onClick={() =>
                              handlePartialRestock(item.id, selectedQty)
                            }
                            className="flex-1 min-h-[44px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            Restock +{selectedQty}
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleFillToPar(item.id)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <PackageCheck className="w-4 h-4 shrink-0" />
                      <span>Fill to Par (+{deficit})</span>
                    </button>
                  </div>
                );
              }
            )}
          </div>
        </>
      )}
    </section>
  );
}
