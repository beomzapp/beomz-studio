/**
 * BEO-329: Feature limits per plan — DB storage tiers.
 *
 * Maps plan key → project_db_limits defaults.
 * Also contains storage add-on price ID → extra resource mapping.
 */

export interface DbFeatureLimits {
  storage_mb: number;
  rows: number | null;   // null = unlimited
  tables: number | null; // null = unlimited
}

export const DB_PLAN_LIMITS: Record<string, DbFeatureLimits> = {
  free: {
    storage_mb: 1024,
    rows: 100000,
    tables: 20,
  },
  pro_starter: {
    storage_mb: 5120,
    rows: 500000,
    tables: 50,
  },
  pro_builder: {
    storage_mb: 15360,
    rows: 2000000,
    tables: 100,
  },
  business: {
    storage_mb: 51200,
    rows: null,
    tables: null,
  },
};

/** Returns the DB feature limits for a given plan key. Falls back to free. */
export function getFeatureLimits(plan: string): DbFeatureLimits {
  return DB_PLAN_LIMITS[plan] ?? DB_PLAN_LIMITS.free!;
}

// ── Storage add-on price map ──────────────────────────────────────────────────

export interface StorageAddon {
  priceId: string;
  extra_storage_mb: number;
  extra_rows: number;
  label: string;
}

export const STORAGE_ADDONS: StorageAddon[] = [
  {
    priceId: "price_1TMttV8PEPiIN5kItiXhAFp8",
    extra_storage_mb: 2048,   // +2 GB
    extra_rows: 200000,
    label: "+2 GB / +200k rows ($5)",
  },
  {
    priceId: "price_1TMttY8PEPiIN5kIJxQy3mO5",
    extra_storage_mb: 10240,  // +10 GB
    extra_rows: 1000000,
    label: "+10 GB / +1M rows ($19)",
  },
  {
    priceId: "price_1TMttb8PEPiIN5kI7SusoitU",
    extra_storage_mb: 51200,  // +50 GB
    extra_rows: 5000000,
    label: "+50 GB / +5M rows ($69)",
  },
];

/** Look up a storage add-on by Stripe price ID. */
export function getStorageAddonByPriceId(priceId: string): StorageAddon | undefined {
  return STORAGE_ADDONS.find((a) => a.priceId === priceId);
}
