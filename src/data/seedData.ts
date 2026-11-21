import { InventoryState } from '../types/inventory';

export const PART_CATEGORIES = [
  'Electrical',
  'Cooling',
  'Plumbing',
  'Mechanical',
  'Controls',
  'Consumables',
] as const;

export function createSeedState(): InventoryState {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

  return {
    vans: [
      {
        id: 'van-01',
        name: 'Van 01 - Ah Meng',
        plateNumber: 'JVA 8821',
      },
      {
        id: 'van-02',
        name: 'Van 02 - Jason',
        plateNumber: 'JVB 3390',
      },
    ],
    inventory: [
      {
        id: 'inv-v1-cap35',
        vanId: 'van-01',
        partName: 'Capacitor 35uF',
        sku: 'CAP-35',
        category: 'Electrical',
        targetQty: 5,
        currentQty: 5,
      },
      {
        id: 'inv-v1-thm01',
        vanId: 'van-01',
        partName: 'Thermostat',
        sku: 'THM-01',
        category: 'Cooling',
        targetQty: 3,
        currentQty: 2,
      },
      {
        id: 'inv-v1-pmp02',
        vanId: 'van-01',
        partName: 'Drain Pump',
        sku: 'PMP-02',
        category: 'Plumbing',
        targetQty: 2,
        currentQty: 0,
      },
      {
        id: 'inv-v1-cop12',
        vanId: 'van-01',
        partName: 'Copper Coupling 1/2"',
        sku: 'COP-12',
        category: 'Plumbing',
        targetQty: 10,
        currentQty: 10,
      },
      {
        id: 'inv-v2-cap35',
        vanId: 'van-02',
        partName: 'Capacitor 35uF',
        sku: 'CAP-35',
        category: 'Electrical',
        targetQty: 5,
        currentQty: 4,
      },
      {
        id: 'inv-v2-cnt24',
        vanId: 'van-02',
        partName: 'Contactor 24V',
        sku: 'CNT-24',
        category: 'Electrical',
        targetQty: 4,
        currentQty: 4,
      },
    ],
    logs: [
      {
        id: 'log-seed-01',
        timestamp: hoursAgo(2),
        vanId: 'van-01',
        vanName: 'Van 01 - Ah Meng',
        partId: 'inv-v1-pmp02',
        partName: 'Drain Pump',
        type: 'CONSUME',
        qty: 2,
        customerRef: 'Sunway Medical Annex / Job #1038',
        status: 'PENDING_CLAIM',
      },
      {
        id: 'log-seed-02',
        timestamp: hoursAgo(4),
        vanId: 'van-01',
        vanName: 'Van 01 - Ah Meng',
        partId: 'inv-v1-thm01',
        partName: 'Thermostat',
        type: 'CONSUME',
        qty: 1,
        customerRef: 'Mr. Lim Residence / Job #1041',
        status: 'PENDING_CLAIM',
      },
      {
        id: 'log-seed-03',
        timestamp: hoursAgo(5),
        vanId: 'van-02',
        vanName: 'Van 02 - Jason',
        partId: 'inv-v2-cap35',
        partName: 'Capacitor 35uF',
        type: 'CONSUME',
        qty: 1,
        customerRef: 'Bangsar Café Unit 4 / Job #1039',
        status: 'PENDING_CLAIM',
      },
      {
        id: 'log-seed-04',
        timestamp: hoursAgo(22),
        vanId: 'van-01',
        vanName: 'Van 01 - Ah Meng',
        partId: 'inv-v1-cap35',
        partName: 'Capacitor 35uF',
        type: 'RESTOCK',
        qty: 2,
        customerRef: 'Base Warehouse Fill · Job #1029',
        status: 'COMPLETED',
      },
    ],
  };
}
