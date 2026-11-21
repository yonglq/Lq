export type AppRole = 'technician' | 'admin';

export type StockStatus = 'full' | 'low' | 'empty';

export const PART_CATEGORIES = [
  'Electrical',
  'Cooling',
  'Plumbing',
  'Mechanical',
  'Controls',
  'Consumables',
] as const;

export interface Van {
  id: string;
  name: string;
  plateNumber: string;
}

export interface VanInventoryItem {
  id: string;
  vanId: string;
  partName: string;
  sku: string;
  category: string;
  targetQty: number;
  currentQty: number;
}

export type TransactionType = 'CONSUME' | 'RESTOCK';

export type TransactionStatus = 'PENDING_CLAIM' | 'RESTOCKED' | 'COMPLETED';

export interface TransactionLog {
  id: string;
  timestamp: string;
  vanId: string;
  vanName: string;
  partId: string;
  partName: string;
  type: TransactionType;
  qty: number;
  customerRef: string;
  status: TransactionStatus;
}

export interface InventoryState {
  vans: Van[];
  inventory: VanInventoryItem[];
  logs: TransactionLog[];
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: 'success' | 'info' | 'warning';
}

export function getDeficitQty(
  item: Pick<VanInventoryItem, 'targetQty' | 'currentQty'>
): number {
  return Math.max(0, item.targetQty - item.currentQty);
}

export function getStockStatus(
  item: Pick<VanInventoryItem, 'targetQty' | 'currentQty'>
): StockStatus {
  if (item.currentQty <= 0) return 'empty';
  if (item.currentQty < item.targetQty) return 'low';
  return 'full';
}

export function getStockBadgeStyle(status: StockStatus): string {
  switch (status) {
    case 'full':
      return 'bg-emerald-100 text-emerald-800';
    case 'low':
      return 'bg-amber-100 text-amber-800';
    case 'empty':
      return 'bg-rose-100 text-rose-800';
  }
}

export function getVanReadiness(items: VanInventoryItem[]): {
  totalCurrent: number;
  totalTarget: number;
  totalDeficit: number;
  percentage: number;
  isFull: boolean;
} {
  const totalCurrent = items.reduce((sum, item) => sum + item.currentQty, 0);
  const totalTarget = items.reduce((sum, item) => sum + item.targetQty, 0);
  const totalDeficit = items.reduce((sum, item) => sum + getDeficitQty(item), 0);
  const percentage =
    totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 100;
  return {
    totalCurrent,
    totalTarget,
    totalDeficit,
    percentage,
    isFull: totalDeficit === 0,
  };
}
