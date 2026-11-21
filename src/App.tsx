/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, ShieldCheck, Wrench } from 'lucide-react';
import { AdminView } from './components/AdminView';
import { AuthScreen } from './components/AuthScreen';
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
import { AuthSession, formatUserLevel } from './types/auth';
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
  // Session token is held strictly in React memory (never persisted to localStorage)
  const [session, setSession] = useState<AuthSession | null>(null);
  const [roleView, setRoleView] = useState<AppRole>('technician');
  const [selectedVanId, setSelectedVanId] = useState<string>(
    () => state.vans[0]?.id ?? ''
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Persist real inventory entries to localStorage
  useEffect(() => {
    localInventoryRepository.save(state);
  }, [state]);

  // Keep selectedVanId valid as vans are added
  useEffect(() => {
    if (!state.vans.some((v) => v.id === selectedVanId)) {
      setSelectedVanId(state.vans[0]?.id ?? '');
    }
  }, [state.vans, selectedVanId]);

  // Level 1 (Admin) and Level 2 (Manager) can access management dashboard; Level 3 (Technician) is field-only
  const canAccessManagementView =
    session?.user.level === 1 || session?.user.level === 2;

  useEffect(() => {
    if (!canAccessManagementView && roleView === 'admin') {
      setRoleView('technician');
    }
  }, [canAccessManagementView, roleView]);

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

  const handleAuthenticated = useCallback(
    (nextSession: AuthSession) => {
      setSession(nextSession);
      setRoleView(
        nextSession.user.level === 1 || nextSession.user.level === 2
          ? 'admin'
          : 'technician'
      );
      pushToast({
        tone: 'success',
        title: `Signed in as ${nextSession.user.full_name}`,
        description: formatUserLevel(nextSession.user.level),
      });
    },
    [pushToast]
  );

  const handleSignOut = useCallback(() => {
    setSession(null);
    setRoleView('technician');
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

  if (!session) {
    return (
      <>
        <AuthScreen onAuthenticated={handleAuthenticated} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const managementLabel = session.user.level === 1 ? 'Admin' : 'Manager';

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F8] text-slate-900">
      {/* Global Navigation Header */}
      <header className="sticky top-0 z-30 bg-white border-t-2 border-t-[#1B499B] border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[72px] py-2 flex items-center justify-between gap-2 sm:gap-4">
          {/* MasBina Security Alarm Logo */}
          <div className="flex items-center gap-2.5 shrink-0 py-0.5">
            <img
              src="/images/masbina-logo.png"
              alt="MasBina Security Alarm Since 1986"
              className="h-12 sm:h-14 w-auto object-contain block shrink-0"
            />
            <span className="hidden lg:inline-block h-6 w-px bg-slate-200" aria-hidden="true" />
            <span className="hidden lg:inline-block font-display text-sm font-bold tracking-tight text-[#1B499B] whitespace-nowrap shrink-0">
              VanSpare Sync
            </span>
          </div>

          {/* Role Switcher Tabs (Level 1 Admin & Level 2 Manager only) */}
          {canAccessManagementView && (
            <nav
              aria-label="Workspace view switcher"
              className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0"
            >
              <button
                type="button"
                onClick={() => setRoleView('technician')}
                aria-current={roleView === 'technician' ? 'page' : undefined}
                className={`min-h-[44px] px-2.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] ${
                  roleView === 'technician'
                    ? 'bg-[#1B499B] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#1B499B]'
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
                onClick={() => setRoleView('admin')}
                aria-current={roleView === 'admin' ? 'page' : undefined}
                className={`min-h-[44px] px-2.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] ${
                  roleView === 'admin'
                    ? 'bg-[#1B499B] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#1B499B]'
                }`}
              >
                <ShieldCheck
                  className="hidden sm:block w-4 h-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {managementLabel}
                  <span className="hidden sm:inline"> View</span>
                </span>
                {totalPendingUnits > 0 && (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${
                      roleView === 'admin' ? 'text-white/90' : 'text-[#E31E24]'
                    }`}
                  >
                    ({totalPendingUnits})
                  </span>
                )}
              </button>
            </nav>
          )}

          {/* Signed-in Account & Sign Out */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:block text-right">
              <p className="text-xs font-semibold text-slate-900 leading-tight max-w-[160px] truncate">
                {session.user.full_name}
              </p>
              <p className="text-[11px] font-medium text-[#1B499B] leading-tight">
                {formatUserLevel(session.user.level)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-[#E31E24]/5 hover:border-[#E31E24]/30 hover:text-[#E31E24] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            {roleView === 'technician' || !canAccessManagementView
              ? 'Field Van Inventory & Usage'
              : session.user.level === 1
                ? 'Admin Control & User Management'
                : 'Manager Fleet & Restock Control'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {roleView === 'technician' || !canAccessManagementView
              ? 'Log parts installed at customer sites and monitor your van par readiness.'
              : session.user.level === 1
                ? 'Fulfill restock claims, configure van par levels, review audit logs, and manage user levels.'
                : 'Fulfill pending technician claims, configure van par levels, and review audit logs.'}
          </p>
        </div>

        {roleView === 'technician' || !canAccessManagementView ? (
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
            currentUser={session.user}
            authToken={session.token}
            vans={state.vans}
            inventory={state.inventory}
            logs={state.logs}
            onConfirmRestock={handleConfirmRestock}
            onUpdateParLevel={handleUpdateParLevel}
            onAddPart={handleAddPart}
            onRemovePart={handleRemovePart}
            onAddVan={handleAddVan}
            onNotify={pushToast}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            MasBina Security Alarm (Since 1986) · VanSpare Sync
          </p>
          <p className="text-xs text-slate-500">
            Signed in as{' '}
            <span className="font-semibold text-slate-700">
              {session.user.full_name}
            </span>{' '}
            · {formatUserLevel(session.user.level)}
          </p>
        </div>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
