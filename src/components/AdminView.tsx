import { TransactionLog, Van, VanInventoryItem } from '../types/inventory';
import { AdminKpiCards } from './admin/AdminKpiCards';
import { AuditHistorySection } from './admin/AuditHistorySection';
import { ParLevelConfigSection } from './admin/ParLevelConfigSection';
import { RestockQueueSection } from './admin/RestockQueueSection';

interface AdminViewProps {
  vans: Van[];
  inventory: VanInventoryItem[];
  logs: TransactionLog[];
  onConfirmRestock: (partId: string, restockQty?: number) => void;
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
  return (
    <div className="space-y-8">
      <AdminKpiCards vans={vans} inventory={inventory} />
      <RestockQueueSection
        vans={vans}
        inventory={inventory}
        logs={logs}
        onConfirmRestock={onConfirmRestock}
      />
      <ParLevelConfigSection
        vans={vans}
        inventory={inventory}
        onUpdateParLevel={onUpdateParLevel}
        onAddPart={onAddPart}
        onRemovePart={onRemovePart}
        onAddVan={onAddVan}
      />
      <AuditHistorySection vans={vans} logs={logs} />
    </div>
  );
}
