/**
 * What an organisation can be given (modules, screens, actions) and what it has. These MIRROR the backend view models
 * (ZestPoint.Data/ViewModel/AccessModels.cs and the access block of SubscriptionModels.cs); change both together (constitution Article 4).
 * Enums travel as names. Screen keys equal the APP_NAV keys; action keys are permission codes (rbac.model.ts), so nothing here invents a new string.
 */
import type { EntitlementSource, ItemDefault, ModeName } from './subscription.model';

export type AccessEffect = 'Allow' | 'Deny';
export type AccessItemKind = 'Module' | 'Screen' | 'Action';

/** Where an item's answer comes from: the module's default, a plan rule, an operator rule, its module being off, or the screens that own an action. */
export type AccessOrigin = 'Default' | 'Plan' | 'Operator' | 'Module' | 'Screen';

export type BulkAccessOperation = 'GrantModule' | 'RevertModule' | 'GrantApplication' | 'RevertApplication';

/** A whole-application grant can last at most this many days. The server enforces it; the form uses it to cap the date picker. */
export const MAX_APPLICATION_GRANT_DAYS = 90;

// ---- What the organisation's own staff are told (inside EntitlementStateDto.access) ----------------

export interface BranchAccessDeltaDto {
  deniedScreens: string[];
  deniedActions: string[];
  allowedScreens: string[];
  allowedActions: string[];
}

/** Screens and actions withheld from the organisation. The default is allowed, so an unrestricted organisation gets empty lists. */
export interface AccessSummaryDto {
  deniedScreens: string[];
  deniedActions: string[];
  /** Only the branches whose answer differs from the organisation-wide one, keyed by branch id. */
  byBranch: Record<string, BranchAccessDeltaDto>;
}

// ---- The catalog -----------------------------------------------------------------------------------

export interface AccessCatalogActionDto { key: string; name: string; group: string }
export interface AccessCatalogScreenDto { key: string; name: string; actions: AccessCatalogActionDto[] }

export interface AccessCatalogModuleDto {
  key: string;
  name: string;
  description: string;
  /** False ("coming soon") while nothing is built behind the module. */
  available: boolean;
  screens: AccessCatalogScreenDto[];
  /** The module's actions no screen owns (shared lookups). */
  actions: AccessCatalogActionDto[];
}

export interface AccessCatalogDto {
  modules: AccessCatalogModuleDto[];
  alwaysOnScreens: string[];
  problems: string[];
}

// ---- One organisation's effective access ----------------------------------------------------------

export interface AccessRuleDto {
  id: string;
  itemKey: string;
  effect: AccessEffect;
  branchId: string | null;
  branchName: string | null;
  validUntilUtc: string | null;
  reason: string;
  grantedBy: string;
  grantGroupId: string | null;
}

export interface AccessNodeDto {
  key: string;
  name: string;
  kind: AccessItemKind;
  allowed: boolean;
  origin: AccessOrigin;
  planEffect: AccessEffect | null;
  rules: AccessRuleDto[];
  actions: AccessNodeDto[];
}

export interface AccessModuleNodeDto {
  key: string;
  name: string;
  description: string;
  available: boolean;
  mode: ModeName;
  includedInPlan: boolean;
  source: EntitlementSource | null;
  itemDefault: ItemDefault;
  validUntilUtc: string | null;
  reason: string | null;
  grantedBy: string | null;
  grantGroupId: string | null;
  screens: AccessNodeDto[];
  actions: AccessNodeDto[];
}

export interface AccessBranchDto { id: string; name: string }

export interface AccessTreeDto {
  tenantId: string;
  /** The branch the tree was evaluated for; null = the organisation as a whole. */
  branchId: string | null;
  branches: AccessBranchDto[];
  modules: AccessModuleNodeDto[];
  /** Operator rules whose key is no longer in the catalog. Never granted; listed so they can be removed. */
  unknownRules: AccessRuleDto[];
  /** The whole-application grant currently in force, if any. */
  applicationGrantGroupId: string | null;
  applicationGrantValidUntilUtc: string | null;
}

export interface AccessGrantResultDto {
  tree: AccessTreeDto;
  /** Modules left out because nothing is built behind them yet. */
  skippedModules: string[];
  grantedModules: string[];
}

// ---- Requests --------------------------------------------------------------------------------------

export interface SetAccessRuleRequest {
  itemKey: string;
  effect: AccessEffect;
  branchId: string | null;
  validUntilUtc: string | null;
  reason: string;
}

export interface BulkAccessRequest {
  tenantIds: string[];
  operation: BulkAccessOperation;
  moduleKey: string | null;
  validUntilUtc: string | null;
  reason: string;
  /** One key per click: repeating the same request applies nothing a second time. */
  idempotencyKey: string;
}

export interface BulkAccessItemDto {
  tenantId: string;
  name: string;
  outcome: 'applied' | 'unchanged' | 'rejected';
  code: string | null;
  message: string | null;
}

export interface BulkAccessResultDto {
  items: BulkAccessItemDto[];
  applied: number;
  unchanged: number;
  rejected: number;
}

export interface ExpiringGrantDto {
  tenantId: string;
  tenantName: string;
  kind: AccessItemKind;
  itemKey: string;
  itemName: string;
  /** For a module the access it gives; for a screen or action Allow or Deny. */
  effect: string;
  validUntilUtc: string;
  reason: string | null;
  grantedBy: string | null;
  grantGroupId: string | null;
}

/** A plan's own rule on one screen or action. */
export interface PlanRuleDto { itemKey: string; effect: AccessEffect }
