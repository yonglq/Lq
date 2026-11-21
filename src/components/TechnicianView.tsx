import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Minus,
  Package,
  Plus,
  Search,
  Truck,
  Undo2,
  Wrench,
} from 'lucide-react';
import {
  TransactionLog,
  Van,
  VanInventoryItem,
  getDeficitQty,
  getStockBadgeStyle,
  getStockStatus,
  getVanReadiness,
} from '../types/inventory';

interface TechnicianViewProps {
  vans: Van[];
  selectedVanId: string;
  onSelectVan: (vanId: string) => void;
  inventory: VanInventoryItem[];
  logs: TransactionLog[];
  onLogUsage: (params: {
    vanId: string;
    partId: string;
    qty: number;
    customerRef: string;
  }) => void;
  onRevertConsumeLog: (logId: string) => void;
}

type ChecklistFilter = 'all' | 'deficit' | 'full';

function formatShortTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function TechnicianView({
  vans,
  selectedVanId,
  onSelectVan,
  inventory,
  logs,
  onLogUsage,
  onRevertConsumeLog,
}: TechnicianViewProps) {
  const vanItems = useMemo(
    () => inventory.filter((item) => item.vanId === selectedVanId),
    [inventory, selectedVanId]
  );

  const selectedVan = useMemo(
    () => vans.find((v) => v.id === selectedVanId) ?? vans[0],
    [vans, selectedVanId]
  );

  const readiness = useMemo(() => getVanReadiness(vanItems), [vanItems]);

  const unclaimedLogs = useMemo(
    () =>
      logs
        .filter(
          (log) =>
            log.vanId === selectedVanId &&
            log.type === 'CONSUME' &&
            log.status === 'PENDING_CLAIM'
        )
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [logs, selectedVanId]
  );

  const firstAvailablePartId = useMemo(
    () => vanItems.find((item) => item.currentQty > 0)?.id ?? '',
    [vanItems]
  );

  const [selectedPartId, setSelectedPartId] =
    useState<string>(firstAvailablePartId);
  const [qty, setQty] = useState<number>(1);
  const [customerRef, setCustomerRef] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [checklistFilter, setChecklistFilter] =
    useState<ChecklistFilter>('all');

  const customerInputRef = useRef<HTMLInputElement>(null);
  const usageFormRef = useRef<HTMLElement>(null);

  const selectedPart = useMemo(
    () => vanItems.find((item) => item.id === selectedPartId) ?? null,
    [vanItems, selectedPartId]
  );

  // Keep selectedPartId valid when switching vans or when a part hits 0 stock
  useEffect(() => {
    const current = vanItems.find((item) => item.id === selectedPartId);
    if (!current || current.currentQty === 0) {
      setSelectedPartId(firstAvailablePartId);
      setQty(1);
    } else if (qty > current.currentQty) {
      setQty(Math.max(1, current.currentQty));
    }
  }, [vanItems, selectedPartId, firstAvailablePartId, qty]);

  const maxQty = selectedPart ? selectedPart.currentQty : 0;

  const handlePartChange = (nextPartId: string) => {
    setSelectedPartId(nextPartId);
    setQty(1);
    setFormError(null);
  };

  const handleDecrement = () => {
    setQty((prev) => Math.max(1, prev - 1));
    setFormError(null);
  };

  const handleIncrement = () => {
    if (!selectedPart) return;
    setQty((prev) => Math.min(selectedPart.currentQty, prev + 1));
    setFormError(null);
  };

  const handleQuickSelectPart = (partId: string) => {
    setSelectedPartId(partId);
    setQty(1);
    setFormError(null);
    usageFormRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
    setTimeout(() => {
      customerInputRef.current?.focus();
    }, 150);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPart || selectedPart.currentQty <= 0) {
      setFormError('Select an in-stock spare part before logging usage.');
      return;
    }

    if (qty < 1 || qty > selectedPart.currentQty) {
      setFormError(
        `Quantity must be between 1 and ${selectedPart.currentQty} available units.`
      );
      return;
    }

    const trimmedRef = customerRef.trim();
    if (!trimmedRef) {
      setFormError(
        'Enter a Customer Name or Job Order ID to record this claim.'
      );
      customerInputRef.current?.focus();
      return;
    }

    onLogUsage({
      vanId: selectedVanId,
      partId: selectedPart.id,
      qty,
      customerRef: trimmedRef,
    });

    setQty(1);
    setCustomerRef('');
    setFormError(null);
  };

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return vanItems
      .filter((item) => {
        if (checklistFilter === 'deficit' && getDeficitQty(item) === 0)
          return false;
        if (checklistFilter === 'full' && getDeficitQty(item) > 0) return false;
        if (!query) return true;
        return (
          item.partName.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const deficitDiff = getDeficitQty(b) - getDeficitQty(a);
        if (deficitDiff !== 0) return deficitDiff;
        return a.partName.localeCompare(b.partName);
      });
  }, [vanItems, searchQuery, checklistFilter]);

  const deficitLineCount = useMemo(
    () => vanItems.filter((item) => getDeficitQty(item) > 0).length,
    [vanItems]
  );

  const hasAnyInStock = vanItems.some((item) => item.currentQty > 0);

  return (
    <div className="space-y-6">
      {/* Top Van Selector + Readiness Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center">
          {/* Prominent Van Selector */}
          <div className="lg:col-span-5">
            <label
              htmlFor="technician-van-select"
              className="block text-sm font-semibold text-slate-700 mb-2"
            >
              Active Service Van
            </label>
            <div className="relative">
              <Truck
                aria-hidden="true"
                className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <select
                id="technician-van-select"
                value={selectedVanId}
                onChange={(e) => {
                  onSelectVan(e.target.value);
                  setFormError(null);
                }}
                className="w-full min-h-[48px] appearance-none bg-slate-50 border border-slate-300 rounded-lg pl-11 pr-10 py-2.5 text-base font-semibold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 transition-colors cursor-pointer"
              >
                {vans.map((van) => (
                  <option key={van.id} value={van.id}>
                    {van.name} ({van.plateNumber})
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="w-5 h-5 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
            </div>
            {selectedVan && (
              <p className="mt-2 text-xs text-slate-500 flex items-center gap-2">
                <span className="font-mono font-medium text-slate-700">
                  {selectedVan.plateNumber}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {vanItems.length} assigned SKUs
                </span>
              </p>
            )}
          </div>

          {/* Readiness Status Banner */}
          <div className="lg:col-span-7 lg:border-l lg:border-slate-200 lg:pl-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-slate-600">
                Van Stock Readiness
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {readiness.percentage}%
                </span>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {readiness.totalCurrent} / {readiness.totalTarget} units
                </span>
              </div>
            </div>

            {/* Readiness Progress Bar */}
            <div
              className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3.5"
              role="progressbar"
              aria-valuenow={readiness.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Van spare parts readiness percentage"
            >
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  readiness.isFull
                    ? 'bg-emerald-600'
                    : readiness.percentage < 50
                      ? 'bg-rose-600'
                      : 'bg-amber-500'
                }`}
                style={{ width: `${readiness.percentage}%` }}
              />
            </div>

            {/* Status Alert Banner */}
            {readiness.totalDeficit > 0 ? (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-amber-100 text-amber-900 text-sm font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Action Needed:{' '}
                  <strong className="font-semibold tabular-nums">
                    {readiness.totalDeficit}{' '}
                    {readiness.totalDeficit === 1 ? 'part' : 'parts'} missing
                  </strong>{' '}
                  (Pending Claim)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-emerald-100 text-emerald-900 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>100% Ready - All Spares Full</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Two-Column Field Operations Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Quick Log Usage Form + Recent Unclaimed Logs */}
        <div className="lg:col-span-5 space-y-6">
          <section
            ref={usageFormRef}
            className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Use Part for Customer
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Deduct consumed parts and queue an automatic restock claim.
                </p>
              </div>
              <Wrench
                className="w-5 h-5 text-slate-400 shrink-0"
                aria-hidden="true"
              />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Select Part */}
              <div>
                <label
                  htmlFor="usage-part-select"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Select Spare Part
                </label>
                <div className="relative">
                  <select
                    id="usage-part-select"
                    value={selectedPartId}
                    onChange={(e) => handlePartChange(e.target.value)}
                    disabled={!hasAnyInStock}
                    className="w-full min-h-[48px] appearance-none bg-white border border-slate-300 rounded-lg pl-3.5 pr-10 py-2.5 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:bg-slate-100 disabled:text-slate-500 transition-colors"
                  >
                    {!hasAnyInStock && (
                      <option value="">No parts currently in stock</option>
                    )}
                    {vanItems.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={item.currentQty === 0}
                      >
                        {item.partName} (Current: {item.currentQty} / Target:{' '}
                        {item.targetQty})
                        {item.currentQty === 0 ? ' — Out of Stock' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </div>
                {selectedPart && (
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      <span className="font-mono">{selectedPart.sku}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{selectedPart.category}</span>
                    </span>
                    <span className="tabular-nums font-medium text-slate-700">
                      {selectedPart.currentQty} available in van
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity Used Stepper */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="usage-qty-value"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Quantity Used
                  </label>
                  {selectedPart && (
                    <span className="text-xs text-slate-500 tabular-nums">
                      Max {selectedPart.currentQty}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDecrement}
                    disabled={!selectedPart || qty <= 1}
                    aria-label="Decrease quantity"
                    className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div
                    id="usage-qty-value"
                    aria-live="polite"
                    className="flex-1 min-h-[48px] flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 font-mono text-xl font-semibold text-slate-900 tabular-nums"
                  >
                    {selectedPart ? qty : 0}
                  </div>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={!selectedPart || qty >= maxQty}
                    aria-label="Increase quantity"
                    className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Customer / Job ID */}
              <div>
                <label
                  htmlFor="usage-customer-ref"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Customer / Job ID <span className="text-rose-600">*</span>
                </label>
                <input
                  ref={customerInputRef}
                  id="usage-customer-ref"
                  type="text"
                  required
                  value={customerRef}
                  onChange={(e) => {
                    setCustomerRef(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g., Mr. Tan / Job #1042"
                  className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 transition-colors"
                />
              </div>

              {/* Validation Message */}
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-800"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!hasAnyInStock}
                className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white font-semibold text-sm transition-all disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 whitespace-nowrap"
              >
                Confirm Usage & Notify Admin
              </button>
            </form>
          </section>

          {/* Compact Recent Unclaimed Logs Card with Undo */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock
                  className="w-4 h-4 text-amber-600 shrink-0"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-bold text-slate-900">
                  Recent Unclaimed Logs
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {unclaimedLogs.length} open
              </span>
            </div>

            {unclaimedLogs.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-slate-500">
                  No unclaimed usage logs for this van.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {unclaimedLogs.map((log) => (
                  <li
                    key={log.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {log.partName}
                        </span>
                        <span className="font-mono text-xs font-semibold text-rose-700 tabular-nums shrink-0">
                          -{log.qty}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        <span>{log.customerRef}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono tabular-nums">
                          {formatShortTime(log.timestamp)}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRevertConsumeLog(log.id)}
                      aria-label={`Undo claim of ${log.qty} ${log.partName}`}
                      className="min-h-[44px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Undo</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column: Current Van Checklist */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Current Van Checklist
                </h2>
                <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
                  {vanItems.length} parts tracked · {deficitLineCount} below par
                </p>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search part name, SKU, or category..."
                  aria-label="Search current van parts"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 transition-colors"
                />
              </div>

              <div
                className="flex items-center p-1 bg-slate-100 rounded-lg shrink-0"
                role="group"
                aria-label="Filter checklist by stock status"
              >
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'deficit', label: `Missing (${deficitLineCount})` },
                    { key: 'full', label: 'Full' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setChecklistFilter(option.key)}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      checklistFilter === option.key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Checklist Rows */}
          {filteredItems.length === 0 ? (
            <div className="p-10 text-center">
              <Package
                className="w-8 h-8 text-slate-300 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-slate-700">
                No spare parts match your filter
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Try clearing your search or switching back to All parts.
              </p>
              {(searchQuery || checklistFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setChecklistFilter('all');
                  }}
                  className="mt-4 min-h-[44px] px-4 py-2 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {filteredItems.map((item) => {
                const deficit = getDeficitQty(item);
                const status = getStockStatus(item);
                const fillPct =
                  item.targetQty > 0
                    ? Math.min(
                        100,
                        Math.round((item.currentQty / item.targetQty) * 100)
                      )
                    : 100;

                const rowBg =
                  status === 'empty'
                    ? 'bg-rose-50/70'
                    : status === 'low'
                      ? 'bg-amber-50/60'
                      : 'bg-white';

                const qtyBadgeClass = getStockBadgeStyle(status);

                const barColorClass =
                  status === 'full'
                    ? 'bg-emerald-600'
                    : status === 'low'
                      ? 'bg-amber-500'
                      : 'bg-rose-600';

                return (
                  <li key={item.id} className={`p-4 sm:px-6 sm:py-4 ${rowBg}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <h3 className="text-base font-semibold text-slate-900 truncate">
                            {item.partName}
                          </h3>
                          {deficit > 0 && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums whitespace-nowrap ${qtyBadgeClass}`}
                            >
                              Need +{deficit}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono text-slate-600">
                            {item.sku}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {status === 'full'
                              ? 'At par'
                              : status === 'empty'
                                ? 'Out of stock'
                                : 'Below par'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold tabular-nums whitespace-nowrap ${qtyBadgeClass}`}
                        >
                          {item.currentQty} / {item.targetQty}
                        </span>

                        <button
                          type="button"
                          disabled={item.currentQty === 0}
                          onClick={() => handleQuickSelectPart(item.id)}
                          className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          {item.currentQty === 0 ? 'Depleted' : 'Use Part'}
                        </button>
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="mt-3 w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-200 ${barColorClass}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
