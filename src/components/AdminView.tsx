import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  History,
  Minus,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Truck,
} from 'lucide-react';
import { PART_CATEGORIES } from '../data/seedData';
import {
  TransactionLog,
  Van,
  VanInventoryItem,
  getDeficitQty,
  getStockStatus,
  getVanReadiness,
} from '../types/inventory';

interface AdminViewProps {
  vans: Van[];
  inventory: VanInventoryItem[];
  logs: TransactionLog[];
  onConfirmRestock: (partId: string) => void;
  onUpdateParLevel: (partId: string, newTargetQty: number) => void;
  onAddPart: (params: {
    vanId: string;
    partName: string;
    sku: string;
    category: string;
    targetQty: number;
    currentQty: number;
  }) => void;
  onRemovePart: (partId: string) => void;
  onAddVan: (params: { name: string; plateNumber: string }) => Van;
}

type AuditTypeFilter = 'ALL' | 'CONSUME' | 'RESTOCK';

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return iso;
  }
}

export function AdminView({
  vans,
  inventory,
  logs,
  onConfirmRestock,
  onUpdateParLevel,
  onAddPart,
  onRemovePart,
  onAddVan,
}: AdminViewProps) {
  // Par Level Configuration state
  const [configVanId, setConfigVanId] = useState<string>(vans[0]?.id ?? '');
  const [showAddVanForm, setShowAddVanForm] = useState<boolean>(false);
  const [newVanName, setNewVanName] = useState<string>('');
  const [newVanPlate, setNewVanPlate] = useState<string>('');
  const [vanFormError, setVanFormError] = useState<string | null>(null);

  const [showAddPartForm, setShowAddPartForm] = useState<boolean>(false);
  const [partName, setPartName] = useState<string>('');
  const [partSku, setPartSku] = useState<string>('');
  const [partCategory, setPartCategory] = useState<string>(PART_CATEGORIES[0]);
  const [partTargetQty, setPartTargetQty] = useState<string>('4');
  const [partCurrentQty, setPartCurrentQty] = useState<string>('4');
  const [partFormError, setPartFormError] = useState<string | null>(null);
  const [confirmRemovePartId, setConfirmRemovePartId] = useState<string | null>(null);

  // Audit History filters
  const [auditVanFilter, setAuditVanFilter] = useState<string>('ALL');
  const [auditTypeFilter, setAuditTypeFilter] = useState<AuditTypeFilter>('ALL');
  const [auditSearch, setAuditSearch] = useState<string>('');

  useEffect(() => {
    if (!vans.some((v) => v.id === configVanId) && vans[0]) {
      setConfigVanId(vans[0].id);
    }
  }, [vans, configVanId]);

  // Fleet KPI Metrics
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

  // Restock & Claim Queue items (all items where currentQty < targetQty)
  const restockQueue = useMemo(() => {
    const vanMap = new Map(vans.map((v) => [v.id, v]));

    return inventory
      .filter((item) => getDeficitQty(item) > 0)
      .map((item) => {
        const van = vanMap.get(item.vanId);
        const deficit = getDeficitQty(item);
        const relatedPendingLogs = logs.filter(
          (log) =>
            log.vanId === item.vanId &&
            log.partId === item.id &&
            log.type === 'CONSUME' &&
            log.status === 'PENDING_CLAIM'
        );
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
        // Out-of-stock (0 qty) items first, then largest deficit
        if (a.item.currentQty === 0 && b.item.currentQty > 0) return -1;
        if (b.item.currentQty === 0 && a.item.currentQty > 0) return 1;
        return b.deficit - a.deficit;
      });
  }, [inventory, vans, logs]);

  const configVan = useMemo(
    () => vans.find((v) => v.id === configVanId) ?? vans[0],
    [vans, configVanId]
  );

  const configVanItems = useMemo(
    () => inventory.filter((item) => item.vanId === configVanId),
    [inventory, configVanId]
  );

  // Filtered Audit History
  const filteredLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return logs
      .filter((log) => {
        if (auditVanFilter !== 'ALL' && log.vanId !== auditVanFilter) return false;
        if (auditTypeFilter !== 'ALL' && log.type !== auditTypeFilter) return false;
        if (!query) return true;
        return (
          log.partName.toLowerCase().includes(query) ||
          log.vanName.toLowerCase().includes(query) ||
          log.customerRef.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [logs, auditVanFilter, auditTypeFilter, auditSearch]);

  const handleAddVanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newVanName.trim();
    const trimmedPlate = newVanPlate.trim().toUpperCase();

    if (!trimmedName || !trimmedPlate) {
      setVanFormError('Enter both a Van Name and Plate Number.');
      return;
    }

    const created = onAddVan({ name: trimmedName, plateNumber: trimmedPlate });
    setConfigVanId(created.id);
    setNewVanName('');
    setNewVanPlate('');
    setVanFormError(null);
    setShowAddVanForm(false);
  };

  const handleAddPartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = partName.trim();
    const trimmedSku = partSku.trim().toUpperCase();
    const parsedTarget = parseInt(partTargetQty, 10);
    const parsedCurrent = parseInt(partCurrentQty, 10);

    if (!trimmedName || !trimmedSku) {
      setPartFormError('Part Name and SKU are required.');
      return;
    }
    if (Number.isNaN(parsedTarget) || parsedTarget < 1) {
      setPartFormError('Target Par Level must be at least 1.');
      return;
    }
    if (
      Number.isNaN(parsedCurrent) ||
      parsedCurrent < 0 ||
      parsedCurrent > parsedTarget
    ) {
      setPartFormError(`Initial stock must be between 0 and ${parsedTarget}.`);
      return;
    }

    onAddPart({
      vanId: configVanId,
      partName: trimmedName,
      sku: trimmedSku,
      category: partCategory,
      targetQty: parsedTarget,
      currentQty: parsedCurrent,
    });

    setPartName('');
    setPartSku('');
    setPartCategory(PART_CATEGORIES[0]);
    setPartTargetQty('4');
    setPartCurrentQty('4');
    setPartFormError(null);
    setShowAddPartForm(false);
  };

  return (
    <div className="space-y-8">
      {/* 1. KPI Summary Cards (All Vans) */}
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

      {/* 2. Restock & Claim Queue (Priority Action Table) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-700" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Restock & Claim Queue
              </h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Parts currently below par level across the fleet requiring warehouse replenishment.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-slate-600 tabular-nums">
            {restockQueue.length} {restockQueue.length === 1 ? 'item' : 'items'} queued
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
                  {restockQueue.map(({ item, vanName, plateNumber, deficit, customerRefs }) => {
                    const status = getStockStatus(item);
                    const badgeClass =
                      status === 'empty'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-4 px-6 align-middle">
                          <p className="font-semibold text-slate-900">{vanName}</p>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            {plateNumber}
                          </p>
                        </td>
                        <td className="py-4 px-4 align-middle">
                          <p className="font-semibold text-slate-900">{item.partName}</p>
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
                          <span className="font-mono font-semibold text-rose-700 tabular-nums">
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
                          <button
                            type="button"
                            onClick={() => onConfirmRestock(item.id)}
                            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.98] text-white text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                          >
                            <PackageCheck className="w-4 h-4 shrink-0" />
                            <span>Confirm Restock (Fill to Par)</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Queue Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {restockQueue.map(({ item, vanName, plateNumber, deficit, customerRefs }) => {
                const status = getStockStatus(item);
                const badgeClass =
                  status === 'empty'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800';

                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-slate-500">
                          {vanName} · <span className="font-mono">{plateNumber}</span>
                        </p>
                        <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                          {item.partName}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono">{item.sku}</span> · {item.category}
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
                      <span className="font-medium text-slate-500">Customer Refs: </span>
                      {customerRefs.length > 0
                        ? customerRefs.join(' · ')
                        : 'Par level adjustment'}
                    </div>

                    <button
                      type="button"
                      onClick={() => onConfirmRestock(item.id)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <PackageCheck className="w-4 h-4 shrink-0" />
                      <span>Confirm Restock (Fill to Par)</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* 3. Par Level Configuration (Manage Standard Load) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal
                  className="w-5 h-5 text-slate-700"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Par Level Configuration
                </h2>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure standard full-load quantities, assign new spare parts, or register vans.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowAddVanForm((prev) => !prev);
                  setShowAddPartForm(false);
                  setVanFormError(null);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Truck className="w-4 h-4" />
                <span>{showAddVanForm ? 'Close Van Form' : 'Add New Van'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAddPartForm((prev) => !prev);
                  setShowAddVanForm(false);
                  setPartFormError(null);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <PackagePlus className="w-4 h-4" />
                <span>{showAddPartForm ? 'Close Part Form' : 'Add Spare Part'}</span>
              </button>
            </div>
          </div>

          {/* Van Selector Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {vans.map((van) => {
              const isSelected = van.id === configVanId;
              const items = inventory.filter((i) => i.vanId === van.id);
              const readiness = getVanReadiness(items);
              return (
                <button
                  key={van.id}
                  type="button"
                  onClick={() => {
                    setConfigVanId(van.id);
                    setConfirmRemovePartId(null);
                  }}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold border transition-colors whitespace-nowrap shrink-0 flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{van.name}</span>
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {readiness.percentage}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Inline Form: Add New Van */}
          {showAddVanForm && (
            <form
              onSubmit={handleAddVanSubmit}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900">
                Register New Service Van
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-van-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Van Name / Driver
                  </label>
                  <input
                    id="new-van-name"
                    type="text"
                    value={newVanName}
                    onChange={(e) => {
                      setNewVanName(e.target.value);
                      setVanFormError(null);
                    }}
                    placeholder="e.g., Van 03 - Ravi"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-van-plate"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Plate Number
                  </label>
                  <input
                    id="new-van-plate"
                    type="text"
                    value={newVanPlate}
                    onChange={(e) => {
                      setNewVanPlate(e.target.value);
                      setVanFormError(null);
                    }}
                    placeholder="e.g., JVC 4510"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono uppercase text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
              </div>
              {vanFormError && (
                <p className="text-xs font-medium text-rose-700">{vanFormError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddVanForm(false)}
                  className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
                >
                  Save Van to Fleet
                </button>
              </div>
            </form>
          )}

          {/* Inline Form: Add New Spare Part */}
          {showAddPartForm && configVan && (
            <form
              onSubmit={handleAddPartSubmit}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900">
                Add Spare Part to {configVan.name}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2">
                  <label
                    htmlFor="new-part-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Part Name
                  </label>
                  <input
                    id="new-part-name"
                    type="text"
                    value={partName}
                    onChange={(e) => {
                      setPartName(e.target.value);
                      setPartFormError(null);
                    }}
                    placeholder="e.g., Fan Motor 1/4HP"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-part-sku"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    SKU
                  </label>
                  <input
                    id="new-part-sku"
                    type="text"
                    value={partSku}
                    onChange={(e) => {
                      setPartSku(e.target.value);
                      setPartFormError(null);
                    }}
                    placeholder="e.g., FAN-14"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono uppercase text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-part-category"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="new-part-category"
                    value={partCategory}
                    onChange={(e) => setPartCategory(e.target.value)}
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  >
                    {PART_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="new-part-target"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Par Qty
                    </label>
                    <input
                      id="new-part-target"
                      type="number"
                      min={1}
                      max={99}
                      value={partTargetQty}
                      onChange={(e) => {
                        setPartTargetQty(e.target.value);
                        setPartCurrentQty(e.target.value);
                        setPartFormError(null);
                      }}
                      className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-part-current"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Current
                    </label>
                    <input
                      id="new-part-current"
                      type="number"
                      min={0}
                      max={99}
                      value={partCurrentQty}
                      onChange={(e) => {
                        setPartCurrentQty(e.target.value);
                        setPartFormError(null);
                      }}
                      className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                    />
                  </div>
                </div>
              </div>
              {partFormError && (
                <p className="text-xs font-medium text-rose-700">{partFormError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartForm(false)}
                  className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
                >
                  Add Part to Van
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Selected Van Parts List */}
        {configVanItems.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No spare parts configured for {configVan?.name} yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Click "Add Spare Part" above to set up this van's standard par load.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">Spare Part</th>
                  <th className="py-3 px-4">SKU / Category</th>
                  <th className="py-3 px-4">Current Stock</th>
                  <th className="py-3 px-4">Target Par Level</th>
                  <th className="py-3 px-6 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {configVanItems.map((item) => {
                  const status = getStockStatus(item);
                  const statusClass =
                    status === 'full'
                      ? 'bg-emerald-100 text-emerald-800'
                      : status === 'low'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        {item.partName}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <span className="font-mono font-medium text-slate-800">
                          {item.sku}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>{item.category}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold tabular-nums whitespace-nowrap ${statusClass}`}
                        >
                          {item.currentQty} / {item.targetQty}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={item.targetQty <= 1}
                            onClick={() =>
                              onUpdateParLevel(item.id, item.targetQty - 1)
                            }
                            aria-label={`Decrease target par for ${item.partName}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-10 text-center font-mono font-semibold text-slate-900 tabular-nums">
                            {item.targetQty}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateParLevel(item.id, item.targetQty + 1)
                            }
                            aria-label={`Increase target par for ${item.partName}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        {confirmRemovePartId === item.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onRemovePart(item.id);
                                setConfirmRemovePartId(null);
                              }}
                              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold whitespace-nowrap"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemovePartId(null)}
                              className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemovePartId(item.id)}
                            aria-label={`Remove ${item.partName} from ${configVan?.name}`}
                            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Transaction & Audit History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" aria-hidden="true" />
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Transaction & Audit History
                </h2>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Chronological ledger of field consumption claims and warehouse restocks.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-3">
            {/* Filter by Van */}
            <div className="relative md:w-56">
              <select
                value={auditVanFilter}
                onChange={(e) => setAuditVanFilter(e.target.value)}
                aria-label="Filter history by van"
                className="w-full min-h-[44px] appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3.5 pr-9 py-2 text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
              >
                <option value="ALL">All Vans</option>
                {vans.map((van) => (
                  <option key={van.id} value={van.id}>
                    {van.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
            </div>

            {/* Filter by Transaction Type */}
            <div
              className="flex items-center p-1 bg-slate-100 rounded-lg shrink-0"
              role="group"
              aria-label="Filter history by transaction type"
            >
              {(
                [
                  { key: 'ALL', label: 'All' },
                  { key: 'CONSUME', label: 'Consumed' },
                  { key: 'RESTOCK', label: 'Restocked' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAuditTypeFilter(tab.key)}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    auditTypeFilter === tab.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Customer/Part */}
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="search"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search part or customer / job ID..."
                aria-label="Search transaction logs"
                className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
              />
            </div>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No transactions match the selected filters
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Field usage logs and warehouse restocks will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Audit Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-6">Timestamp</th>
                    <th className="py-3 px-4">Van</th>
                    <th className="py-3 px-4">Part</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4">Customer / Job ID</th>
                    <th className="py-3 px-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredLogs.map((log) => {
                    const isConsume = log.type === 'CONSUME';
                    const statusBadge =
                      log.status === 'PENDING_CLAIM'
                        ? {
                            label: 'Pending Claim',
                            className: 'bg-amber-100 text-amber-800',
                          }
                        : log.status === 'RESTOCKED'
                          ? {
                              label: 'Restocked',
                              className: 'bg-emerald-100 text-emerald-800',
                            }
                          : {
                              label: 'Completed',
                              className: 'bg-emerald-100 text-emerald-800',
                            };

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3.5 px-6 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {log.vanName}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {log.partName}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                          {isConsume ? 'Consumed' : 'Restocked'}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            isConsume ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {isConsume ? `-${log.qty}` : `+${log.qty}`}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 max-w-xs truncate">
                          {log.customerRef}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked History List */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredLogs.map((log) => {
                const isConsume = log.type === 'CONSUME';
                const statusBadge =
                  log.status === 'PENDING_CLAIM'
                    ? {
                        label: 'Pending Claim',
                        className: 'bg-amber-100 text-amber-800',
                      }
                    : log.status === 'RESTOCKED'
                      ? {
                          label: 'Restocked',
                          className: 'bg-emerald-100 text-emerald-800',
                        }
                      : {
                          label: 'Completed',
                          className: 'bg-emerald-100 text-emerald-800',
                        };

                return (
                  <div key={log.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {log.partName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {log.vanName} ·{' '}
                          <span className="font-mono tabular-nums">
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </p>
                      </div>
                      <span
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          isConsume ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {isConsume ? `-${log.qty}` : `+${log.qty}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-xs text-slate-600 truncate">
                        {log.customerRef}
                      </p>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
