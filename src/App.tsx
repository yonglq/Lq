/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, ShieldCheck, Truck, Wrench } from 'lucide-react';
import { AdminView } from './components/AdminView';
import { TechnicianView } from './components/TechnicianView';
import { ToastContainer } from './components/ToastContainer';
import {
  addPartToVanInState,
  addVanInState,
  consumePartInState,
  createEntityId,
  localInventoryRepository,
  removePartFromVanInState,
  restockPartInState,
  revertConsumeLogInState,
  updateParLevelInState,
} from './services/inventoryStore';
import {
  AppRole,
  InventoryState,
  ToastMessage,
  Van,
  getDeficitQty,
} from './types/inventory';

export default function App() {
  const [state, setState] = useState<InventoryState>(() =>
    localInventoryRepository.load()
  );
  const [role, setRole] = useState<AppRole>('technician');
  const [selectedVanId, setSelectedVanId] = useState<string>(
    () => state.vans[0]?.id ?? 'van-01'
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  // Persist every state transition to localStorage
  useEffect(() => {
    localInventoryRepository.save(state);
  }, [state]);

  // Keep selectedVanId valid if state resets
  useEffect(() => {
    if (!state.vans.some((v) => v.id === selectedVanId) && state.vans[0]) {
      setSelectedVanId(state.vans[0].id);
    }
  }, [state.vans, selectedVanId]);

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = createEntityId('toast');
    setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const totalPendingUnits = useMemo(
    () => state.inventory.reduce((sum, item) => sum + getDeficitQty(item), 0),
    [state.inventory]
  );

  const handleLogUsage = useCallback(
    (params: {
      vanId: string;
      partId: string;
      qty: number;
      customerRef: string;
    }) => {
      let toastQueued = false;
      setState((prev) => {
        const result = consumePartInState(prev, params);
        if (!result) return prev;

        if (!toastQueued) {
          toastQueued = true;
          queueMicrotask(() => {
            pushToast({
              tone: 'success',
              title: `Recorded! Claim ${params.qty}x ${result.item.partName} from Admin when back at base.`,
              description: `Logged for ${result.log.customerRef} · ${result.log.vanName}`,
            });
          });
        }
        return result.nextState;
      });
    },
    [pushToast]
  );

  const handleRevertConsumeLog = useCallback(
    (logId: string) => {
      let toastQueued = false;
      setState((prev) => {
        const result = revertConsumeLogInState(prev, logId);
        if (!result) return prev;

        if (!toastQueued) {
          toastQueued = true;
          queueMicrotask(() => {
            pushToast({
              tone: 'info',
              title: `Reverted ${result.revertedLog.qty}x ${result.revertedLog.partName}`,
              description: `Stock restored to ${result.revertedLog.vanName} and claim removed.`,
            });
          });
        }
        return result.nextState;
      });
    },
    [pushToast]
  );

  const handleConfirmRestock = useCallback(
    (partId: string, restockQty?: number) => {
      let toastQueued = false;
      setState((prev) => {
        const result = restockPartInState(prev, partId, restockQty);
        if (!result) return prev;

        if (!toastQueued) {
          toastQueued = true;
          const reachedPar = result.item.currentQty === result.item.targetQty;
          queueMicrotask(() => {
            pushToast({
              tone: 'success',
              title: `Restocked ${result.restockedQty}x ${result.item.partName} for ${result.van.name}`,
              description: reachedPar
                ? `Filled to full par (${result.item.currentQty} / ${result.item.targetQty}) and closed pending claims.`
                : `Partial fill applied (${result.item.currentQty} / ${result.item.targetQty} now in van).`,
            });
          });
        }
        return result.nextState;
      });
    },
    [pushToast]
  );

  const handleUpdateParLevel = useCallback(
    (partId: string, newTargetQty: number) => {
      setState((prev) => updateParLevelInState(prev, partId, newTargetQty));
    },
    []
  );

  const handleAddPart = useCallback(
    (params: {
      vanId: string;
      partName: string;
      sku: string;
      category: string;
      targetQty: number;
      currentQty: number;
    }) => {
      let toastQueued = false;
      setState((prev) => {
        const result = addPartToVanInState(prev, params);
        if (!result) return prev;

        const vanName =
          prev.vans.find((v) => v.id === params.vanId)?.name ?? 'van';

        if (!toastQueued) {
          toastQueued = true;
          queueMicrotask(() => {
            pushToast({
              tone: 'info',
              title: `Added ${result.item.partName} (${result.item.sku})`,
              description: `Assigned to ${vanName} with par level ${result.item.targetQty}.`,
            });
          });
        }
        return result.nextState;
      });
    },
    [pushToast]
  );

  const handleRemovePart = useCallback(
    (partId: string) => {
      let toastQueued = false;
      setState((prev) => {
        const target = prev.inventory.find((i) => i.id === partId);
        if (!target) return prev;

        if (!toastQueued) {
          toastQueued = true;
          queueMicrotask(() => {
            pushToast({
              tone: 'info',
              title: `Removed ${target.partName} (${target.sku})`,
              description:
                'Part removed from the van par list and open claims resolved.',
            });
          });
        }
        return removePartFromVanInState(prev, partId);
      });
    },
    [pushToast]
  );

  const handleAddVan = useCallback(
    (params: { name: string; plateNumber: string }): Van => {
      const newVan: Van = {
        id: createEntityId('van'),
        name: params.name.trim(),
        plateNumber: params.plateNumber.trim().toUpperCase(),
      };

      let toastQueued = false;
      setState((prev) => {
        const result = addVanInState(prev, newVan);
        if (!toastQueued) {
          toastQueued = true;
          queueMicrotask(() => {
            pushToast({
              tone: 'success',
              title: `Registered ${result.van.name}`,
              description: `Plate ${result.van.plateNumber} added to fleet monitoring.`,
            });
          });
        }
        return result.nextState;
      });

      return newVan;
    },
    [pushToast]
  );

  const handleResetDemoData = useCallback(() => {
    const fresh = localInventoryRepository.reset();
    setState(fresh);
    setSelectedVanId(fresh.vans[0]?.id ?? 'van-01');
    setConfirmReset(false);
    pushToast({
      tone: 'info',
      title: 'Demo data restored',
      description: 'Vans, par levels, and pending claims have been reset.',
    });
  }, [pushToast]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F8] text-slate-900">
      {/* Global Navigation Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </div>
            <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              VanSpare Sync
            </span>
          </div>

          {/* Role Switcher Tabs */}
          <nav
            aria-label="Role view switcher"
            className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0"
          >
            <button
              type="button"
              onClick={() => setRole('technician')}
              aria-current={role === 'technician' ? 'page' : undefined}
              className={`min-h-[44px] px-2.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                role === 'technician'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench
                className="hidden sm:block w-4 h-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Technician<span className="hidden sm:inline"> View</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRole('admin')}
              aria-current={role === 'admin' ? 'page' : undefined}
              className={`min-h-[44px] px-2.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                role === 'admin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck
                className="hidden sm:block w-4 h-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Admin<span className="hidden sm:inline"> View</span>
              </span>
              {totalPendingUnits > 0 && (
                <span className="font-mono text-xs text-amber-700 font-bold tabular-nums">
                  ({totalPendingUnits})
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            {role === 'technician'
              ? 'Field Van Inventory & Usage'
              : 'Warehouse Restock & Fleet Control'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {role === 'technician'
              ? 'Log parts installed at customer sites and monitor your van par readiness.'
              : 'Fulfill pending technician claims, tune van par levels, and review audit logs.'}
          </p>
        </div>

        {role === 'technician' ? (
          <TechnicianView
            vans={state.vans}
            selectedVanId={selectedVanId}
            onSelectVan={setSelectedVanId}
            inventory={state.inventory}
            logs={state.logs}
            onLogUsage={handleLogUsage}
            onRevertConsumeLog={handleRevertConsumeLog}
          />
        ) : (
          <AdminView
            vans={state.vans}
            inventory={state.inventory}
            logs={state.logs}
            onConfirmRestock={handleConfirmRestock}
            onUpdateParLevel={handleUpdateParLevel}
            onAddPart={handleAddPart}
            onRemovePart={handleRemovePart}
            onAddVan={handleAddVan}
          />
        )}
      </main>

      {/* Quiet Footer with Reset Demo Data Utility */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            VanSpare Sync · Closed-loop van par-level inventory tracker
          </p>

          <div className="flex items-center gap-2">
            {confirmReset ? (
              <>
                <span className="text-xs font-medium text-slate-600">
                  Restore initial demo data?
                </span>
                <button
                  type="button"
                  onClick={handleResetDemoData}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Demo Data</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
