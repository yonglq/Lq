import { createSeedState } from '../data/seedData';
import {
  InventoryState,
  TransactionLog,
  Van,
  VanInventoryItem,
} from '../types/inventory';

const STORAGE_KEY = 'vanspare_sync_state_v1';

export interface InventoryRepository {
  load(): InventoryState;
  save(state: InventoryState): void;
  reset(): InventoryState;
}

/**
 * LocalStorage-backed inventory repository.
 * Isolated behind a small interface so it can be swapped with Firestore or Supabase later.
 */
export const localInventoryRepository: InventoryRepository = {
  load(): InventoryState {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = createSeedState();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }
      const parsed = JSON.parse(raw) as Partial<InventoryState>;
      if (
        Array.isArray(parsed.vans) &&
        Array.isArray(parsed.inventory) &&
        Array.isArray(parsed.logs) &&
        parsed.vans.length > 0
      ) {
        return {
          vans: parsed.vans,
          inventory: parsed.inventory,
          logs: parsed.logs,
        };
      }
    } catch {
      // Fallback to fresh seed data if storage is unavailable or corrupted
    }
    const seed = createSeedState();
    this.save(seed);
    return seed;
  },

  save(state: InventoryState): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota/storage errors in restricted environments
    }
  },

  reset(): InventoryState {
    const seed = createSeedState();
    this.save(seed);
    return seed;
  },
};

export function createEntityId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

export function consumePartInState(
  state: InventoryState,
  params: {
    vanId: string;
    partId: string;
    qty: number;
    customerRef: string;
  }
): {
  nextState: InventoryState;
  log: TransactionLog;
  item: VanInventoryItem;
} | null {
  const van = state.vans.find((v) => v.id === params.vanId);
  const item = state.inventory.find(
    (i) => i.id === params.partId && i.vanId === params.vanId
  );

  if (!van || !item) return null;
  if (params.qty < 1 || params.qty > item.currentQty) return null;

  const trimmedRef = params.customerRef.trim();
  if (!trimmedRef) return null;

  const updatedItem: VanInventoryItem = {
    ...item,
    currentQty: item.currentQty - params.qty,
  };

  const log: TransactionLog = {
    id: createEntityId('log'),
    timestamp: new Date().toISOString(),
    vanId: van.id,
    vanName: van.name,
    partId: item.id,
    partName: item.partName,
    type: 'CONSUME',
    qty: params.qty,
    customerRef: trimmedRef,
    status: 'PENDING_CLAIM',
  };

  const nextState: InventoryState = {
    ...state,
    inventory: state.inventory.map((i) => (i.id === item.id ? updatedItem : i)),
    logs: [log, ...state.logs],
  };

  return { nextState, log, item: updatedItem };
}

export function revertConsumeLogInState(
  state: InventoryState,
  logId: string
): {
  nextState: InventoryState;
  revertedLog: TransactionLog;
} | null {
  const targetLog = state.logs.find(
    (log) =>
      log.id === logId &&
      log.type === 'CONSUME' &&
      log.status === 'PENDING_CLAIM'
  );
  if (!targetLog) return null;

  const nextInventory = state.inventory.map((item) => {
    if (item.id !== targetLog.partId || item.vanId !== targetLog.vanId) {
      return item;
    }
    return {
      ...item,
      currentQty: Math.min(item.targetQty, item.currentQty + targetLog.qty),
    };
  });

  const nextState: InventoryState = {
    ...state,
    inventory: nextInventory,
    logs: state.logs.filter((log) => log.id !== targetLog.id),
  };

  return { nextState, revertedLog: targetLog };
}

export function restockPartInState(
  state: InventoryState,
  partId: string,
  restockQty?: number
): {
  nextState: InventoryState;
  restockedQty: number;
  closedClaimsCount: number;
  item: VanInventoryItem;
  van: Van;
} | null {
  const item = state.inventory.find((i) => i.id === partId);
  if (!item) return null;

  const van = state.vans.find((v) => v.id === item.vanId);
  if (!van) return null;

  const deficit = Math.max(0, item.targetQty - item.currentQty);
  if (deficit === 0) return null;

  const requestedQty =
    restockQty === undefined ? deficit : Math.floor(restockQty);
  if (Number.isNaN(requestedQty) || requestedQty < 1) return null;

  const actualRestockQty = Math.min(deficit, requestedQty);
  const nextCurrentQty = Math.min(
    item.targetQty,
    item.currentQty + actualRestockQty
  );
  const reachedPar = nextCurrentQty === item.targetQty;

  // Match open claims chronologically (oldest first)
  const matchingPendingLogs = state.logs
    .filter(
      (log) =>
        log.vanId === item.vanId &&
        log.partId === item.id &&
        log.type === 'CONSUME' &&
        log.status === 'PENDING_CLAIM'
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const closedLogIds = new Set<string>();
  const referencedClaims: TransactionLog[] = [];

  if (reachedPar) {
    for (const log of matchingPendingLogs) {
      closedLogIds.add(log.id);
      referencedClaims.push(log);
    }
  } else {
    let remainingUnits = actualRestockQty;
    for (const log of matchingPendingLogs) {
      if (remainingUnits <= 0) break;
      if (log.qty <= remainingUnits) {
        closedLogIds.add(log.id);
        referencedClaims.push(log);
        remainingUnits -= log.qty;
      } else {
        // Strict FIFO: stop before jumping over an older unfulfilled claim
        break;
      }
    }
    // If a partial restock is smaller than the oldest claim, still cite the oldest open claim for audit context
    if (referencedClaims.length === 0 && matchingPendingLogs[0]) {
      referencedClaims.push(matchingPendingLogs[0]);
    }
  }

  const uniqueRefs = Array.from(
    new Set(referencedClaims.map((l) => l.customerRef).filter(Boolean))
  );

  const restockPrefix = reachedPar ? 'Restock for' : 'Partial restock for';
  const restockLog: TransactionLog = {
    id: createEntityId('log'),
    timestamp: new Date().toISOString(),
    vanId: van.id,
    vanName: van.name,
    partId: item.id,
    partName: item.partName,
    type: 'RESTOCK',
    qty: actualRestockQty,
    customerRef:
      uniqueRefs.length > 0
        ? `${restockPrefix} ${uniqueRefs.join(', ')}`
        : reachedPar
          ? 'Base Warehouse Par Fill'
          : 'Partial Base Warehouse Restock',
    status: 'COMPLETED',
  };

  const updatedItem: VanInventoryItem = {
    ...item,
    currentQty: nextCurrentQty,
  };

  const updatedLogs = state.logs.map((log) =>
    closedLogIds.has(log.id) ? { ...log, status: 'RESTOCKED' as const } : log
  );

  const nextState: InventoryState = {
    ...state,
    inventory: state.inventory.map((i) => (i.id === item.id ? updatedItem : i)),
    logs: [restockLog, ...updatedLogs],
  };

  return {
    nextState,
    restockedQty: actualRestockQty,
    closedClaimsCount: closedLogIds.size,
    item: updatedItem,
    van,
  };
}

export function restockPartToParInState(state: InventoryState, partId: string) {
  return restockPartInState(state, partId);
}

export function updateParLevelInState(
  state: InventoryState,
  partId: string,
  newTargetQty: number
): InventoryState {
  const safeTarget = Math.max(1, Math.floor(newTargetQty));
  let deficitCleared = false;

  const nextInventory = state.inventory.map((item) => {
    if (item.id !== partId) return item;
    const nextCurrentQty = Math.min(item.currentQty, safeTarget);
    if (safeTarget - nextCurrentQty === 0) {
      deficitCleared = true;
    }
    return {
      ...item,
      targetQty: safeTarget,
      currentQty: nextCurrentQty,
    };
  });

  const nextLogs = deficitCleared
    ? state.logs.map((log) => {
        if (
          log.partId === partId &&
          log.type === 'CONSUME' &&
          log.status === 'PENDING_CLAIM'
        ) {
          return { ...log, status: 'COMPLETED' as const };
        }
        return log;
      })
    : state.logs;

  return {
    ...state,
    inventory: nextInventory,
    logs: nextLogs,
  };
}

export function addPartToVanInState(
  state: InventoryState,
  params: {
    vanId: string;
    partName: string;
    sku: string;
    category: string;
    targetQty: number;
    currentQty: number;
  }
): { nextState: InventoryState; item: VanInventoryItem } | null {
  const normalizedSku = params.sku.trim().toUpperCase();
  const normalizedName = params.partName.trim();
  if (!normalizedSku || !normalizedName) return null;

  const duplicateExists = state.inventory.some(
    (item) =>
      item.vanId === params.vanId &&
      item.sku.trim().toUpperCase() === normalizedSku
  );
  if (duplicateExists) return null;

  const safeTarget = Math.max(1, Math.floor(params.targetQty));
  const safeCurrent = Math.max(
    0,
    Math.min(safeTarget, Math.floor(params.currentQty))
  );

  const item: VanInventoryItem = {
    id: createEntityId('inv'),
    vanId: params.vanId,
    partName: normalizedName,
    sku: normalizedSku,
    category: params.category.trim() || 'Electrical',
    targetQty: safeTarget,
    currentQty: safeCurrent,
  };

  return {
    item,
    nextState: {
      ...state,
      inventory: [...state.inventory, item],
    },
  };
}

export function removePartFromVanInState(
  state: InventoryState,
  partId: string
): InventoryState {
  const nextLogs = state.logs.map((log) => {
    if (
      log.partId === partId &&
      log.type === 'CONSUME' &&
      log.status === 'PENDING_CLAIM'
    ) {
      return { ...log, status: 'COMPLETED' as const };
    }
    return log;
  });

  return {
    ...state,
    inventory: state.inventory.filter((item) => item.id !== partId),
    logs: nextLogs,
  };
}

export function addVanInState(
  state: InventoryState,
  params: { id?: string; name: string; plateNumber: string }
): { nextState: InventoryState; van: Van } {
  const van: Van = {
    id: params.id ?? createEntityId('van'),
    name: params.name.trim(),
    plateNumber: params.plateNumber.trim().toUpperCase(),
  };

  return {
    van,
    nextState: {
      ...state,
      vans: [...state.vans, van],
    },
  };
}
