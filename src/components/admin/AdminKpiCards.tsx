import { useMemo } from 'react';
import {
  Van,
  VanInventoryItem,
  getDeficitQty,
  getVanReadiness,
} from '../../types/inventory';

interface AdminKpiCardsProps {
  vans: Van[];
  inventory: VanInventoryItem[];
}

export function AdminKpiCards({ vans, inventory }: AdminKpiCardsProps) {
  const kpis = useMemo(() => {
    const totalVans = vans.length;
    const totalPendingUnits = inventory.reduce(
      (sum, item) => sum + getDeficitQty(item),
      0
    );
    const affectedPartLines = inventory.filter(
      (item) => getDeficitQty(item) > 0
    ).length;

    const vansAtFullReadiness = vans.filter((van) => {
      const items = inventory.filter((item) => item.vanId === van.id);
      return getVanReadiness(items).isFull;
    }).length;

    const fleetReadiness = getVanReadiness(inventory);

    return {
      totalVans,
      totalPendingUnits,
      affectedPartLines,
      vansAtFullReadiness,
      fleetPercentage: fleetReadiness.percentage,
    };
  }, [vans, inventory]);

  return (
    <section aria-label="Fleet inventory summary">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm font-medium text-slate-500">Total Vans Monitored</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-3xl font-bold text-slate-900 tabular-nums">
              {kpis.totalVans}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {inventory.length} SKU slots
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm font-medium text-slate-500">Total Pending Claims</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`font-display text-3xl font-bold tabular-nums ${
                kpis.totalPendingUnits > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {kpis.totalPendingUnits}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {kpis.affectedPartLines}{' '}
              {kpis.affectedPartLines === 1 ? 'part line' : 'part lines'} to restock
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm font-medium text-slate-500">
            Vans at 100% Readiness
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-3xl font-bold text-slate-900 tabular-nums">
              {kpis.vansAtFullReadiness}{' '}
              <span className="text-lg font-semibold text-slate-400">
                / {kpis.totalVans}
              </span>
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {kpis.fleetPercentage}% fleet stock
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
