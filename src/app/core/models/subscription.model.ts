/**
 * Subscription, entitlement and platform-administration contracts. These MIRROR the backend view models
 * (ZestPoint.Data/ViewModel/SubscriptionModels.cs); change both together (constitution Article 4). Enums travel as names.
 */
import type { AccessSummaryDto, PlanRuleDto } from './access.model';
import { PagedResult } from './staff.model';

export type { PagedResult };

/** All: every screen and action of the module is included unless withdrawn. OnlyGranted ("Selective"): the module is on but only individually granted ones work. */
export type ItemDefault = 'All' | 'OnlyGranted';

export type BillingInterval = 'Monthly' | 'Yearly';
export type SubscriptionStatus = 'Trialing' | 'Active' | 'PastDue' | 'Restricted' | 'Cancelled';
export type RestrictionPolicy = 'LockedExceptBilling' | 'PerModule';
export type ModeName = 'Full' | 'ReadOnly' | 'None';
export type EntitlementSource = 'Plan' | 'AddOn' | 'Override';
export type NotificationLevel = 'Info' | 'Warning' | 'Critical';
export type LimitKind = 'Branches' | 'Staff' | 'MonthlyOrders';
export type ActorKind = 'System' | 'Tenant' | 'Platform';
export type BillingEventStatus = 'Open' | 'Paid' | 'Failed' | 'Void';
export type BillingEventType = 'Invoice' | 'Payment' | 'Credit' | 'PlanChange';

export type LedgerEventType =
  | 'TrialStarted' | 'TrialEnded' | 'FeatureActivated' | 'PlanUpgraded' | 'PlanDowngraded' | 'PlanDowngradeScheduled' | 'WarningIssued'
  | 'GraceStarted' | 'GraceExpired' | 'ModuleRestricted' | 'PaymentReconciled' | 'AccessRestored' | 'AdministrativeOverride'
  | 'SubscriptionCancelled' | 'SubscriptionResumed' | 'RenewalFailed' | 'Renewed' | 'PeriodExtended' | 'GrantExpired';

export interface PlanFeatureDto { featureKey: string; modeWhenRestricted: ModeName; itemDefault: ItemDefault }

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string;
  priceMinor: number;
  currencyCode: string;
  interval: BillingInterval;
  maxBranches: number | null;
  maxStaff: number | null;
  maxMonthlyOrders: number | null;
  /** Paid messages (SMS and WhatsApp) a month. Null or 0: none included, so they go by e-mail. Unlike the limits above, null is not unlimited. */
  monthlyMessageAllowance: number | null;
  /** The support promise: minutes to a first reply (null: none promised), counted inside the support hours (days are bits, Monday = 1 ... Sunday = 64; minutes from midnight in support's time zone). */
  supportFirstResponseNormalMinutes: number | null;
  supportFirstResponseUrgentMinutes: number | null;
  supportDays: number;
  supportFromMinute: number;
  supportToMinute: number;
  /** The plan gives the company a named contact at ZestPoint (the owner on its customer record). */
  namedContact: boolean;
  trialDays: number;
  warningDays: number;
  graceDays: number;
  restrictionPolicy: RestrictionPolicy;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  features: PlanFeatureDto[];
  /** Screens and actions the plan allows or withdraws beneath its modules. */
  rules: PlanRuleDto[];
  rowVersion: string;
}

export interface SavePlanRequest {
  code: string;
  name: string;
  description: string;
  priceMinor: number;
  currencyCode: string;
  interval: BillingInterval;
  maxBranches: number | null;
  maxStaff: number | null;
  maxMonthlyOrders: number | null;
  /** Paid messages (SMS and WhatsApp) a month. Null or 0: none included, so they go by e-mail. Unlike the limits above, null is not unlimited. */
  monthlyMessageAllowance: number | null;
  supportFirstResponseNormalMinutes: number | null;
  supportFirstResponseUrgentMinutes: number | null;
  supportDays: number;
  supportFromMinute: number;
  supportToMinute: number;
  namedContact: boolean;
  trialDays: number;
  warningDays: number;
  graceDays: number;
  restrictionPolicy: RestrictionPolicy;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  features: PlanFeatureDto[];
  rules: PlanRuleDto[];
  rowVersion: string | null;
}

export interface FeatureModuleDto { key: string; name: string; description: string }

export interface SubscriptionDto {
  status: SubscriptionStatus;
  plan: PlanDto;
  pendingPlan: { code: string; name: string } | null;
  startedAtUtc: string;
  currentPeriodStartUtc: string;
  currentPeriodEndUtc: string;
  trialEndsAtUtc: string | null;
  graceEndsAtUtc: string | null;
  nextPaymentAttemptAtUtc: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
  paymentMethodLabel: string | null;
  billingIsDemo: boolean;
  billingProvider: string;
}

export interface ModuleAccessDto {
  key: string;
  name: string;
  mode: ModeName;
  includedInPlan: boolean;
  source: EntitlementSource | null;
  validUntilUtc: string | null;
  reason: string | null;
  itemDefault: ItemDefault;
  /** False while nothing is built behind the module ("coming soon"). */
  available: boolean;
}

export interface LimitUsageDto { kind: LimitKind; limit: number | null; used: number; exceeded: boolean }

export interface BannerDto {
  level: NotificationLevel;
  code: string;
  title: string;
  message: string;
  affectedModules: string[];
  dueAtUtc: string | null;
  graceEndsAtUtc: string | null;
  /** "update-payment", "choose-plan", "resume" */
  actions: string[];
}

export interface EntitlementStateDto {
  status: SubscriptionStatus;
  planCode: string;
  planName: string;
  locked: boolean;
  restricted: boolean;
  banner: BannerDto | null;
  modules: ModuleAccessDto[];
  limits: LimitUsageDto[];
  /** Screens and actions withheld from this organisation. A UX snapshot; the API re-checks every call. */
  access: AccessSummaryDto;
}

export interface BillingEventDto {
  id: string;
  type: BillingEventType;
  status: BillingEventStatus;
  amountMinor: number;
  currencyCode: string;
  description: string;
  periodStartUtc: string | null;
  periodEndUtc: string | null;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  occurredAtUtc: string;
  isDemo: boolean;
}

export interface LedgerEntryDto {
  id: string;
  type: LedgerEventType;
  featureKey: string | null;
  fromMode: ModeName | null;
  toMode: ModeName | null;
  fromPlanCode: string | null;
  toPlanCode: string | null;
  reason: string;
  actorKind: ActorKind;
  actorLabel: string;
  occurredAtUtc: string;
}

export interface NotificationDto {
  id: string;
  level: NotificationLevel;
  code: string;
  title: string;
  body: string;
  dateCreated: string;
  readAtUtc: string | null;
  link: string | null;
}

/** The bell: how many the person has not read and the latest few. */
export interface NotificationSummaryDto {
  unread: number;
  latest: NotificationDto[];
}

// ---- Platform administration ----------------------------------------------------------------------

export interface PlatformSessionDto {
  /** The operator's own id (matches ticket assignments and CRM owners). */
  id: string;
  accessToken: string;
  accessTokenExpiresAtUtc: string;
  displayName: string;
  email: string;
  role: 'SupportAgent' | 'SupportLead' | 'Admin';
  /** What this operator may do; decides what the screens show. The server checks every request again. */
  permissions: string[];
}

export interface PlatformTenantListItemDto {
  id: string;
  name: string;
  slug: string;
  enterpriseType: string;
  countryCode: string;
  businessEmail: string;
  dateCreated: string;
  planCode: string | null;
  status: SubscriptionStatus | null;
  currentPeriodEndUtc: string | null;
}

export interface PlatformTenantDetailDto {
  tenant: PlatformTenantListItemDto;
  subscription: SubscriptionDto | null;
  entitlements: EntitlementStateDto | null;
  branches: number;
  staff: number;
  ordersThisMonth: number;
  billing: BillingEventDto[];
  ledger: LedgerEntryDto[];
}

export interface PlatformOverviewDto {
  totalTenants: number;
  byStatus: Record<string, number>;
  byPlan: Record<string, number>;
  mrrMinorByCurrency: Record<string, number>;
  needingAttention: PlatformTenantListItemDto[];
}
