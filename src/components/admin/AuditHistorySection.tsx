import { useMemo, useState } from 'react';
import { ChevronDown, History, Search } from 'lucide-react';
import { TransactionLog, Van } from '../../types/inventory';

interface AuditHistorySectionProps {
  vans: Van[];
  logs: TransactionLog[];
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

export function AuditHistorySection({ vans, logs }: AuditHistorySectionProps) {
  const [auditVanFilter, setAuditVanFilter] = useState<string>('ALL');
  const [auditTypeFilter, setAuditTypeFilter] =
    useState<AuditTypeFilter>('ALL');
  const [auditSearch, setAuditSearch] = useState<string>('');

  const filteredLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return logs
      .filter((log) => {
        if (auditVanFilter !== 'ALL' && log.vanId !== auditVanFilter) {
          return false;
        }
        if (auditTypeFilter !== 'ALL' && log.type !== auditTypeFilter) {
          return false;
        }
        if (!query) return true;
        return (
          log.partName.toLowerCase().includes(query) ||
          log.vanName.toLowerCase().includes(query) ||
          log.customerRef.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [logs, auditVanFilter, auditTypeFilter, auditSearch]);

  return (
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
            {filteredLogs.length}{' '}
            {filteredLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row gap-3">
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
  );
}
