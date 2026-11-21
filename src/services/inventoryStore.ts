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
): { nextState: InventoryState; log: TransactionLog; item: VanInventoryItem } | null {
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

export function restockPartToParInState(
  state: InventoryState,
  partId: string
): { nextState: InventoryState; restockedQty: number; item: VanInventoryItem; van: Van } | null {
  const item = state.inventory.find((i) => i.id === partId);
  if (!item) return null;

  const van = state.vans.find((v) => v.id === item.vanId);
  if (!van) return null;

  const deficit = Math.max(0, item.targetQty - item.currentQty);
  if (deficit === 0) return null;

  const matchingPendingLogs = state.logs.filter(
    (log) =>
      log.vanId === item.vanId &&
      log.partId === item.id &&
      log.type === 'CONSUME' &&
      log.status === 'PENDING_CLAIM'
  );

  const uniqueRefs = Array.from(
    new Set(matchingPendingLogs.map((l) => l.customerRef).filter(Boolean))
  );

  const restockLog: TransactionLog = {
    id: createEntityId('log'),
    timestamp: new Date().toISOString(),
    vanId: van.id,
    vanName: van.name,
    partId: item.id,
    partName: item.partName,
    type: 'RESTOCK',
    qty: deficit,
    customerRef:
      uniqueRefs.length > 0
        ? `Restock for ${uniqueRefs.join(', ')}`
        : 'Base Warehouse Par Fill',
    status: 'COMPLETED',
  };

  const updatedItem: VanInventoryItem = {
    ...item,
    currentQty: item.targetQty,
  };

  const updatedLogs = state.logs.map((log) => {
    if (
      log.vanId === item.vanId &&
      log.partId === item.id &&
      log.type === 'CONSUME' &&
      log.status === 'PENDING_CLAIM'
    ) {
      return { ...log, status: 'RESTOCKED' as const };
    }
    return log;
  });

  const nextState: InventoryState = {
    ...state,
    inventory: state.inventory.map((i) => (i.id === item.id ? updatedItem : i)),
    logs: [restockLog, ...updatedLogs],
  };

  return { nextState, restockedQty: deficit, item: updatedItem, van };
}

export function updateParLevelInState(
  state: InventoryState,
  partId: string,
  newTargetQty: number
): InventoryState {
  const safeTarget = Math.max(1, Math.floor(newTargetQty));
  return {
    ...state,
    inventory: state.inventory.map((item) => {
      if (item.id !== partId) return item;
      return {
        ...item,
        targetQty: safeTarget,
        currentQty: Math.min(item.currentQty, safeTarget),
      };
    }),
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
): { nextState: InventoryState; item: VanInventoryItem } {
  const safeTarget = Math.max(1, Math.floor(params.targetQty));
  const safeCurrent = Math.max(0, Math.min(safeTarget, Math.floor(params.currentQty)));

  const item: VanInventoryItem = {
    id: createEntityId('inv'),
    vanId: params.vanId,
    partName: params.partName.trim(),
    sku: params.sku.trim().toUpperCase(),
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
  return {
    ...state,
    inventory: state.inventory.filter((item) => item.id !== partId),
  };
}

export function addVanInState(
  state: InventoryState,
  params: { name: string; plateNumber: string }
): { nextState: InventoryState; van: Van } {
  const van: Van = {
    id: createEntityId('van'),
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
