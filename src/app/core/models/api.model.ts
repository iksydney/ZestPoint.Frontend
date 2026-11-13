/**
 * Wire contracts with the ZestPoint API (ZestPoint.Data/ViewModel/*). Enums travel as their string names.
 * Keep in sync with the backend; see constitution Article 4.
 */

import type { EntitlementStateDto } from './subscription.model';

/** Standard response envelope returned by every endpoint. */
export interface ApiEnvelope<T> {
  readonly result: T;
  readonly message: string | null;
  readonly code: string | null;
  readonly errors: Readonly<Record<string, readonly string[]>> | null;
  readonly successful: boolean;
}

export type EnterpriseTypeCode =
  | 'RetailStore' | 'Supermarket' | 'Bar' | 'Lounge' | 'Nightclub' | 'Hotel' | 'Restaurant'
  | 'Cafe' | 'BeachClubPoolBar' | 'Resort' | 'MultiOutletGroup' | 'Other';

export type EnterpriseCategory = 'Retail' | 'Hospitality' | 'Group' | 'Other';
export type BrandingColorScheme = 'Light' | 'Dark' | 'System';
export type OnboardingStep = 'Company' | 'Branding' | 'Staff' | 'Subscription';

export interface EnterpriseTypeDto {
  readonly id: string;
  readonly code: EnterpriseTypeCode;
  readonly name: string;
  readonly category: EnterpriseCategory;
  readonly description: string;
  readonly defaultThemePreset: string;
  readonly terminology: Readonly<Record<string, string>>;
  readonly suggestedModules: readonly string[];
  readonly defaults: Readonly<Record<string, unknown>>;
}

export interface RegisterCompanyRequest {
  companyName: string;
  slug: string | null;
  /** The primary type. A business that is several things at once lists the others in additionalEnterpriseTypes. */
  enterpriseType: EnterpriseTypeCode;
  additionalEnterpriseTypes: EnterpriseTypeCode[];
  customEnterpriseType: string | null;
  businessEmail: string;
  businessPhone: string;
  countryCode: string;
  currencyCode: string;
  /** Extra currencies to open a wallet in; the wallet for currencyCode is always created and is the default. */
  walletCurrencies: string[];
  /** The answer to "will you use the bar man method?", asked of bar-type businesses only. The server refuses true for any other business. */
  useBarManMethod: boolean | null;
  timeZoneId: string;
  primaryLocation: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
}

/** The business types offered the bar man method. Mirrors BarOrderRules.BarTypes in the API (ZestPoint.Service/Domain); keep in sync. */
export const BAR_MAN_METHOD_TYPES: readonly EnterpriseTypeCode[] = ['Bar', 'Nightclub', 'Lounge', 'BeachClubPoolBar'];

export interface SlugAvailabilityDto {
  readonly slug: string;
  readonly available: boolean;
  readonly reason: string | null;
  readonly suggestion: string | null;
}

export interface TenantSummaryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly enterpriseType: EnterpriseTypeCode;
  readonly customEnterpriseType: string | null;
  readonly currencyCode: string;
  readonly timeZoneId: string;
  readonly countryCode: string;
  readonly terminology: Readonly<Record<string, string>>;
}

export interface MembershipSummaryDto {
  readonly id: string;
  readonly displayName: string;
  /** Sign-in code formatted "BHL-007": the company's letters, a dash and the person's number. */
  readonly staffCode: string;
  readonly isOwner: boolean;
  readonly roles: readonly string[];
}

/** 'locked' = not in the plan, 'readonly' = visible but mutating actions are rejected. */
export type AccessMode = 'full' | 'readonly' | 'locked';

export interface BrandingDto {
  readonly isDraft: boolean;
  readonly version: number;
  readonly themePreset: string;
  readonly companyName: string;
  readonly shortName: string;
  readonly tagline: string | null;
  readonly initialsFallback: string;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
  readonly surfaceColor: string;
  readonly textColor: string;
  readonly successColor: string;
  readonly warningColor: string;
  readonly errorColor: string;
  readonly onPrimaryColor: string;
  readonly onSecondaryColor: string;
  readonly colorScheme: BrandingColorScheme;
  readonly fontFamily: string;
  readonly receiptHeader: string | null;
  readonly receiptFooter: string | null;
  readonly publishedAtUtc: string | null;
  readonly rowVersion: string;
}

export interface OnboardingStepDto {
  readonly step: OnboardingStep;
  readonly key: string;
  readonly completed: boolean;
}

export interface OnboardingProgressDto {
  readonly currentStep: OnboardingStep;
  readonly isComplete: boolean;
  readonly percent: number;
  readonly steps: readonly OnboardingStepDto[];
  readonly resumeStateJson: string | null;
  readonly rowVersion: string;
}

/** What the app needs after sign-in. Permissions/entitlements are a UX snapshot; the API re-checks everything. */
export interface AuthSessionDto {
  readonly accessToken: string;
  readonly accessTokenExpiresAtUtc: string;
  readonly tenant: TenantSummaryDto;
  readonly membership: MembershipSummaryDto;
  readonly permissions: readonly string[];
  readonly hasAllBranches: boolean;
  readonly branchIds: readonly string[];
  readonly entitlements: Readonly<Record<string, AccessMode>>;
  /** Plan, status, account banner and per-module access. A UX snapshot: the API enforces the same rules on every request. */
  readonly subscription: EntitlementStateDto;
  readonly branding: BrandingDto;
  readonly onboarding: OnboardingProgressDto;
}

export interface RegistrationResult {
  readonly tenantId: string;
  readonly slug: string;
  readonly session: AuthSessionDto;
}

export interface PasswordLoginRequest {
  readonly tenantSlug: string;
  readonly email: string;
  readonly password: string;
}

export interface PinLoginRequest {
  readonly tenantSlug: string;
  /** As typed: "BHL-007"; case and the dash are optional. */
  readonly staffCode: string;
  readonly pin: string;
}

export interface ContrastIssueDto {
  readonly pair: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly required: number;
  readonly blocking: boolean;
  readonly message: string;
}

export interface BrandingStateDto {
  readonly published: BrandingDto;
  readonly draft: BrandingDto | null;
  readonly issues: readonly ContrastIssueDto[];
}

export interface ThemePresetDto {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly isDark: boolean;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
  readonly surfaceColor: string;
  readonly textColor: string;
}

export interface ThemeSuggestionDto {
  readonly harmony: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
  readonly surfaceColor: string;
  readonly textColor: string;
}

export interface PublicBrandingDto {
  readonly tenantSlug: string;
  readonly branding: BrandingDto;
}

/** Editable theme fields, as sent to PUT /api/v1/branding/draft. */
export interface SaveBrandingRequest {
  themePreset: string;
  shortName: string;
  tagline: string | null;
  initials: string | null;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  successColor: string | null;
  warningColor: string | null;
  errorColor: string | null;
  colorScheme: BrandingColorScheme;
  fontFamily: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  rowVersion: string | null;
}

export interface CompanyProfileDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly enterpriseType: EnterpriseTypeCode;
  readonly additionalEnterpriseTypes: readonly EnterpriseTypeCode[];
  readonly customEnterpriseType: string | null;
  readonly businessEmail: string;
  readonly businessPhone: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly timeZoneId: string;
  readonly primaryLocation: string;
  readonly wallets: readonly WalletDto[];
}

export interface WalletDto {
  readonly id: string;
  readonly currencyCode: string;
  readonly isDefault: boolean;
  readonly balance: number;
}

export type UpdateCompanyProfileRequest = Omit<CompanyProfileDto, 'id' | 'slug' | 'wallets' | 'additionalEnterpriseTypes'> & {
  additionalEnterpriseTypes: EnterpriseTypeCode[];
};
