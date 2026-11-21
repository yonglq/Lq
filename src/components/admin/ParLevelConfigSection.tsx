import React, { useEffect, useMemo, useState } from 'react';
import {
  Minus,
  PackagePlus,
  Plus,
  SlidersHorizontal,
  Trash2,
  Truck,
} from 'lucide-react';
import {
  PART_CATEGORIES,
  Van,
  VanInventoryItem,
  getStockBadgeStyle,
  getStockStatus,
  getVanReadiness,
} from '../../types/inventory';

interface ParLevelConfigSectionProps {
  vans: Van[];
  inventory: VanInventoryItem[];
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

export function ParLevelConfigSection({
  vans,
  inventory,
  onUpdateParLevel,
  onAddPart,
  onRemovePart,
  onAddVan,
}: ParLevelConfigSectionProps) {
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
  const [hasManuallyEditedCurrent, setHasManuallyEditedCurrent] =
    useState<boolean>(false);
  const [partFormError, setPartFormError] = useState<string | null>(null);
  const [confirmRemovePartId, setConfirmRemovePartId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!vans.some((v) => v.id === configVanId) && vans[0]) {
      setConfigVanId(vans[0].id);
    }
  }, [vans, configVanId]);

  const configVan = useMemo(
    () => vans.find((v) => v.id === configVanId) ?? vans[0],
    [vans, configVanId]
  );

  const configVanItems = useMemo(
    () => inventory.filter((item) => item.vanId === configVanId),
    [inventory, configVanId]
  );

  const resetPartForm = () => {
    setPartName('');
    setPartSku('');
    setPartCategory(PART_CATEGORIES[0]);
    setPartTargetQty('4');
    setPartCurrentQty('4');
    setHasManuallyEditedCurrent(false);
    setPartFormError(null);
  };

  const handleTargetQtyChange = (nextValue: string) => {
    setPartTargetQty(nextValue);
    setPartFormError(null);

    const parsedTarget = parseInt(nextValue, 10);
    if (!hasManuallyEditedCurrent) {
      setPartCurrentQty(nextValue);
      return;
    }

    const parsedCurrent = parseInt(partCurrentQty, 10);
    if (
      !Number.isNaN(parsedTarget) &&
      parsedTarget >= 0 &&
      !Number.isNaN(parsedCurrent) &&
      parsedCurrent > parsedTarget
    ) {
      setPartCurrentQty(String(parsedTarget));
    }
  };

  const handleCurrentQtyChange = (nextValue: string) => {
    setPartCurrentQty(nextValue);
    setHasManuallyEditedCurrent(true);
    setPartFormError(null);
  };

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

    const duplicateSku = configVanItems.some(
      (item) => item.sku.trim().toUpperCase() === trimmedSku
    );
    if (duplicateSku) {
      setPartFormError(
        `SKU "${trimmedSku}" already exists on ${configVan?.name ?? 'this van'}. Adjust its par level in the table below instead.`
      );
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

    resetPartForm();
    setShowAddPartForm(false);
  };

  return (
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
              disabled={vans.length === 0}
              onClick={() => {
                setShowAddPartForm((prev) => {
                  const next = !prev;
                  if (next) resetPartForm();
                  return next;
                });
                setShowAddVanForm(false);
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <PackagePlus className="w-4 h-4" />
              <span>
                {showAddPartForm ? 'Close Part Form' : 'Add Spare Part'}
              </span>
            </button>
          </div>
        </div>

        {/* Van Selector Tabs */}
        {vans.length > 0 && (
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
                    setPartFormError(null);
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
        )}

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
              <p role="alert" className="text-xs font-medium text-rose-700">
                {vanFormError}
              </p>
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
                    onChange={(e) => handleTargetQtyChange(e.target.value)}
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
                    max={Math.max(1, parseInt(partTargetQty, 10) || 99)}
                    value={partCurrentQty}
                    onChange={(e) => handleCurrentQtyChange(e.target.value)}
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
              </div>
            </div>
            {partFormError && (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {partFormError}
              </p>
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
      {vans.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No service vans registered yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Click &ldquo;Add New Van&rdquo; above to register your first service van and configure its standard par load.
          </p>
        </div>
      ) : configVanItems.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No spare parts configured for {configVan?.name} yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Click &ldquo;Add Spare Part&rdquo; above to set up this van&rsquo;s standard par load.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6 min-w-[160px]">Spare Part</th>
                <th className="py-3 px-4 whitespace-nowrap">SKU / Category</th>
                <th className="py-3 px-4 whitespace-nowrap">Current Stock</th>
                <th className="py-3 px-4 whitespace-nowrap">Target Par Level</th>
                <th className="py-3 px-6 text-right whitespace-nowrap">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {configVanItems.map((item) => {
                const statusClass = getStockBadgeStyle(getStockStatus(item));

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-6 font-semibold text-slate-900">
                      {item.partName}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
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
  );
}
