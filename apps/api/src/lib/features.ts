/**
 * BEO-329: Feature limits per plan — DB storage tiers.
 *
 * Maps plan key → project_db_limits defaults.
 * Also contains storage add-on price ID → extra resource mapping.
 */

export interface DbFeatureLimits {
  storage_mb: number;
  db_projects: number;
  rows: null;
  tables: null;
}

export const DB_PLAN_LIMITS: Record<string, DbFeatureLimits> = {
  free: {
    storage_mb: 200,
    db_projects: 1,
    rows: null,
    tables: null,
  },
  pro_starter: {
    storage_mb: 1024,
    db_projects: 1,
    rows: null,
    tables: null,
  },
  pro_builder: {
    storage_mb: 5120,
    db_projects: 1,
    rows: null,
    tables: null,
  },
  business: {
    storage_mb: 15360,
    db_projects: 1,
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
  label: string;
  price_usd: number;
  extra_storage_mb: number;
  price_id: string | undefined;
}

export const STORAGE_ADDONS: StorageAddon[] = [
  {
    label: "+500MB",
    price_usd: 5,
    extra_storage_mb: 512,
    price_id: process.env.STRIPE_STORAGE_500MB,
  },
  {
    label: "+2GB",
    price_usd: 12,
    extra_storage_mb: 2048,
    price_id: process.env.STRIPE_STORAGE_2GB,
  },
  {
    label: "+10GB",
    price_usd: 29,
    extra_storage_mb: 10240,
    price_id: process.env.STRIPE_STORAGE_10GB,
  },
];

export const DEDICATED_DB_ADDON = {
  label: "Dedicated Database",
  price_usd: 39,
  price_id: process.env.STRIPE_DEDICATED_DB_MONTHLY,
};

export interface PublicStorageAddon {
  label: string;
  price_usd: number;
  extra_storage_mb: number;
}

export function getPublicStorageAddons(): PublicStorageAddon[] {
  return STORAGE_ADDONS.map(({ label, price_usd, extra_storage_mb }) => ({
    label,
    price_usd,
    extra_storage_mb,
  }));
}

/** Look up a storage add-on by Stripe price ID. */
export function getStorageAddonByPriceId(priceId: string): StorageAddon | undefined {
  return STORAGE_ADDONS.find((a) => a.price_id === priceId);
}
