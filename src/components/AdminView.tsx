import { AuthUser } from '../types/auth';
import { TransactionLog, Van, VanInventoryItem } from '../types/inventory';
import { AdminKpiCards } from './admin/AdminKpiCards';
import { AuditHistorySection } from './admin/AuditHistorySection';
import { ParLevelConfigSection } from './admin/ParLevelConfigSection';
import { RestockQueueSection } from './admin/RestockQueueSection';
import { UserManagementSection } from './admin/UserManagementSection';

interface AdminViewProps {
  currentUser: AuthUser;
  authToken: string;
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
  onNotify: (toast: {
    tone: 'success' | 'info' | 'warning';
    title: string;
    description?: string;
  }) => void;
}

export function AdminView({
  currentUser,
  authToken,
  vans,
  inventory,
  logs,
  onConfirmRestock,
  onUpdateParLevel,
  onAddPart,
  onRemovePart,
  onAddVan,
  onNotify,
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
      {/* Level 1 (Admin) Exclusive User Management Dashboard */}
      {currentUser.level === 1 && (
        <UserManagementSection
          currentUser={currentUser}
          authToken={authToken}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
