import type {
  OrgRow,
  ReferralCodeRow,
  ReferralEventRow,
  StudioDbClient,
  UserRow,
} from "@beomz-studio/studio-db";

export const REFERRAL_SIGNUP_REWARD_CREDITS = 50;
export const REFERRAL_UPGRADE_REWARD_CREDITS = 200;
export const REFERRAL_SIGNUP_CAP = 3;

type ReferralDb = Pick<
StudioDbClient,
| "countReferralEventsByReferrerId"
| "createReferralCode"
| "createReferralEvent"
| "findPrimaryOrgByUserId"
| "findReferralCodeByCode"
| "findReferralCodeByUserId"
| "findUserById"
| "getOrgWithBalance"
| "hasReferralEvent"
| "listReferralEventsByReferrerId"
| "updateOrg"
| "updateUser"
>;

interface ReferralAuthUser {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

interface ApplySignupReferralRewardInput {
  clientIp?: string | null;
  db: ReferralDb;
  fetchImpl?: typeof fetch;
  ipqsApiKey?: string | null;
  referralCode: string;
  referredOrgId: string;
  referredUserId: string;
  referrerId?: string | null;
}

interface ApplySignupReferralRewardResult {
  referredOrg: OrgRow | null;
  referredUser: UserRow | null;
  referrerRewarded: boolean;
}

function readMetadataReferralCode(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) {
    return null;
  }

  const candidates = [
    metadata.ref,
    metadata.referral_code,
    metadata.referralCode,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeReferralCode(candidate);
    }
  }

  return null;
}

function isRewardedReferralEvent(event: ReferralEventRow): boolean {
  return Number(event.credits_awarded ?? 0) > 0;
}

function hasRecentRewardFromIp(events: ReferralEventRow[], clientIp: string | null | undefined): boolean {
  if (!clientIp) {
    return false;
  }

  const cutoff = Date.now() - (24 * 60 * 60 * 1000);

  return events.some((event) => {
    if (event.event !== "signup" || !isRewardedReferralEvent(event)) {
      return false;
    }

    if (event.signup_ip !== clientIp) {
      return false;
    }

    const createdAtMs = Date.parse(event.created_at);
    return Number.isFinite(createdAtMs) && createdAtMs >= cutoff;
  });
}

async function isVpnOrProxyIp(
  clientIp: string | null | undefined,
  apiKey: string | null | undefined,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  if (!clientIp || !apiKey) {
    return false;
  }

  try {
    const response = await fetchImpl(
      `https://www.ipqualityscore.com/api/json/ip/${encodeURIComponent(apiKey)}/${encodeURIComponent(clientIp)}`,
      { signal: AbortSignal.timeout(3000) },
    );

    if (!response.ok) {
      return false;
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    return payload?.vpn === true || payload?.proxy === true;
  } catch (error) {
    console.warn("[referral] IPQS check failed, allowing referral reward:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

export function normalizeReferralCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function generateReferralCode(random = Math.random): string {
  return random().toString(36).slice(2, 10).toUpperCase();
}

export function getReferralCodeFromRequest(
  requestUrl: string,
  authUser?: ReferralAuthUser | null,
): string | null {
  const queryCode = normalizeReferralCode(new URL(requestUrl).searchParams.get("ref"));
  if (queryCode) {
    return queryCode;
  }

  return readMetadataReferralCode(authUser?.user_metadata)
    ?? readMetadataReferralCode(authUser?.app_metadata);
}

export async function ensureReferralCodeForUser(
  db: ReferralDb,
  userId: string,
): Promise<ReferralCodeRow> {
  const existing = await db.findReferralCodeByUserId(userId);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const created = await db.createReferralCode({
      code: generateReferralCode(),
      user_id: userId,
    });

    if (created) {
      return created;
    }

    const raced = await db.findReferralCodeByUserId(userId);
    if (raced) {
      return raced;
    }
  }

  throw new Error(`Failed to create referral code for user ${userId}`);
}

export async function applySignupReferralReward(
  input: ApplySignupReferralRewardInput,
): Promise<ApplySignupReferralRewardResult> {
  const normalizedCode = normalizeReferralCode(input.referralCode);
  if (!normalizedCode) {
    return {
      referredOrg: await input.db.getOrgWithBalance(input.referredOrgId),
      referredUser: await input.db.findUserById(input.referredUserId),
      referrerRewarded: false,
    };
  }

  const referrerId = input.referrerId
    ?? (await input.db.findReferralCodeByCode(normalizedCode))?.user_id
    ?? null;

  if (!referrerId || referrerId === input.referredUserId) {
    return {
      referredOrg: await input.db.getOrgWithBalance(input.referredOrgId),
      referredUser: await input.db.findUserById(input.referredUserId),
      referrerRewarded: false,
    };
  }

  const referredUser = await input.db.updateUser(input.referredUserId, {
    referred_by: referrerId,
  });

  const referredOrg = await input.db.getOrgWithBalance(input.referredOrgId);

  const existingSignupReward = await input.db.hasReferralEvent(
    referrerId,
    input.referredUserId,
    "signup",
  );

  if (existingSignupReward) {
    return {
      referredOrg,
      referredUser,
      referrerRewarded: false,
    };
  }

  const existingEvents = await input.db.listReferralEventsByReferrerId(referrerId);
  const rewardedSignupEvents = existingEvents.filter((event) =>
    event.event === "signup" && isRewardedReferralEvent(event),
  );

  if (rewardedSignupEvents.length >= REFERRAL_SIGNUP_CAP) {
    return {
      referredOrg,
      referredUser,
      referrerRewarded: false,
    };
  }

  const clientIp = input.clientIp ?? null;
  const sameIpTriggeredRecently = hasRecentRewardFromIp(rewardedSignupEvents, clientIp);
  const isVpn = await isVpnOrProxyIp(clientIp, input.ipqsApiKey, input.fetchImpl ?? fetch);

  if (sameIpTriggeredRecently || isVpn) {
    await input.db.createReferralEvent({
      credits_awarded: 0,
      event: "signup",
      is_vpn: isVpn,
      referred_id: input.referredUserId,
      referrer_id: referrerId,
      signup_ip: clientIp,
    });

    return {
      referredOrg,
      referredUser,
      referrerRewarded: false,
    };
  }

  const referrerOrg = await input.db.findPrimaryOrgByUserId(referrerId);
  if (!referrerOrg) {
    return {
      referredOrg,
      referredUser,
      referrerRewarded: false,
    };
  }

  await input.db.createReferralEvent({
    credits_awarded: REFERRAL_SIGNUP_REWARD_CREDITS,
    event: "signup",
    is_vpn: false,
    referred_id: input.referredUserId,
    referrer_id: referrerId,
    signup_ip: clientIp,
  });

  await input.db.updateOrg(referrerOrg.id, {
    credits: Number(referrerOrg.credits ?? 0) + REFERRAL_SIGNUP_REWARD_CREDITS,
  });

  return {
    referredOrg,
    referredUser,
    referrerRewarded: true,
  };
}

export async function applyUpgradeReferralReward(
  db: ReferralDb,
  referredUserId: string,
): Promise<ReferralEventRow | null> {
  const referredUser = await db.findUserById(referredUserId);
  const referrerId = referredUser?.referred_by ?? null;

  if (!referredUser || !referrerId || referrerId === referredUserId) {
    return null;
  }

  const existingReward = await db.hasReferralEvent(referrerId, referredUserId, "upgrade");
  if (existingReward) {
    return null;
  }

  const referrerOrg = await db.findPrimaryOrgByUserId(referrerId);
  if (!referrerOrg) {
    return null;
  }

  const event = await db.createReferralEvent({
    credits_awarded: REFERRAL_UPGRADE_REWARD_CREDITS,
    event: "upgrade",
    referred_id: referredUserId,
    referrer_id: referrerId,
  });

  await db.updateOrg(referrerOrg.id, {
    credits: Number(referrerOrg.credits ?? 0) + REFERRAL_UPGRADE_REWARD_CREDITS,
  });

  console.log("[referral] upgrade reward: 200cr to", referrerId);
  return event;
}

export function summariseReferralStats(events: ReferralEventRow[]) {
  let signups = 0;
  let signupCredits = 0;
  let upgrades = 0;
  let upgradeCredits = 0;

  for (const event of events) {
    const credits = Number(event.credits_awarded ?? 0);
    if (credits <= 0) {
      continue;
    }

    if (event.event === "signup") {
      signups += 1;
      signupCredits += credits;
      continue;
    }

    if (event.event === "upgrade") {
      upgrades += 1;
      upgradeCredits += credits;
    }
  }

  return {
    signups,
    signupCapReached: signups >= REFERRAL_SIGNUP_CAP,
    signupCredits,
    totalCredits: signupCredits + upgradeCredits,
    upgradeCredits,
    upgrades,
  };
}
