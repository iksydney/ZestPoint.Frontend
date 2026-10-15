import { FEATURES, FeatureCode } from './rbac.model';

export interface Country {
  readonly code: string;
  readonly name: string;
  readonly currency: string;
  readonly timeZone: string;
}

/** Countries offered at registration, each with a sensible default currency and time zone (both stay editable). */
export const COUNTRIES: readonly Country[] = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN', timeZone: 'Africa/Lagos' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', timeZone: 'Africa/Accra' },
  { code: 'KE', name: 'Kenya', currency: 'KES', timeZone: 'Africa/Nairobi' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', timeZone: 'Africa/Johannesburg' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', timeZone: 'Africa/Cairo' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', timeZone: 'Africa/Dar_es_Salaam' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', timeZone: 'Africa/Kampala' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', timeZone: 'Africa/Kigali' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', timeZone: 'Africa/Dakar' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', timeZone: 'Africa/Abidjan' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', timeZone: 'Africa/Douala' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB', timeZone: 'Africa/Addis_Ababa' },
  { code: 'MA', name: 'Morocco', currency: 'MAD', timeZone: 'Africa/Casablanca' },
  { code: 'US', name: 'United States', currency: 'USD', timeZone: 'America/New_York' },
  { code: 'CA', name: 'Canada', currency: 'CAD', timeZone: 'America/Toronto' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', timeZone: 'America/Mexico_City' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', timeZone: 'America/Sao_Paulo' },
  { code: 'JM', name: 'Jamaica', currency: 'JMD', timeZone: 'America/Jamaica' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timeZone: 'Europe/London' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', timeZone: 'Europe/Dublin' },
  { code: 'FR', name: 'France', currency: 'EUR', timeZone: 'Europe/Paris' },
  { code: 'DE', name: 'Germany', currency: 'EUR', timeZone: 'Europe/Berlin' },
  { code: 'ES', name: 'Spain', currency: 'EUR', timeZone: 'Europe/Madrid' },
  { code: 'IT', name: 'Italy', currency: 'EUR', timeZone: 'Europe/Rome' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', timeZone: 'Europe/Lisbon' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', timeZone: 'Europe/Amsterdam' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timeZone: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', timeZone: 'Asia/Riyadh' },
  { code: 'IN', name: 'India', currency: 'INR', timeZone: 'Asia/Kolkata' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', timeZone: 'Asia/Singapore' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', timeZone: 'Asia/Kuala_Lumpur' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', timeZone: 'Asia/Manila' },
  { code: 'AU', name: 'Australia', currency: 'AUD', timeZone: 'Australia/Sydney' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', timeZone: 'Pacific/Auckland' }
];

export const CURRENCIES: readonly { code: string; name: string }[] = [
  { code: 'NGN', name: 'Nigerian naira' }, { code: 'GHS', name: 'Ghanaian cedi' }, { code: 'KES', name: 'Kenyan shilling' },
  { code: 'ZAR', name: 'South African rand' }, { code: 'EGP', name: 'Egyptian pound' }, { code: 'TZS', name: 'Tanzanian shilling' },
  { code: 'UGX', name: 'Ugandan shilling' }, { code: 'RWF', name: 'Rwandan franc' }, { code: 'XOF', name: 'West African CFA franc' },
  { code: 'XAF', name: 'Central African CFA franc' }, { code: 'ETB', name: 'Ethiopian birr' }, { code: 'MAD', name: 'Moroccan dirham' },
  { code: 'USD', name: 'US dollar' }, { code: 'CAD', name: 'Canadian dollar' }, { code: 'MXN', name: 'Mexican peso' },
  { code: 'BRL', name: 'Brazilian real' }, { code: 'JMD', name: 'Jamaican dollar' }, { code: 'GBP', name: 'Pound sterling' },
  { code: 'EUR', name: 'Euro' }, { code: 'AED', name: 'UAE dirham' }, { code: 'SAR', name: 'Saudi riyal' }, { code: 'INR', name: 'Indian rupee' },
  { code: 'SGD', name: 'Singapore dollar' }, { code: 'MYR', name: 'Malaysian ringgit' }, { code: 'PHP', name: 'Philippine peso' },
  { code: 'AUD', name: 'Australian dollar' }, { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'CNY', name: 'Chinese yuan' }, { code: 'JPY', name: 'Japanese yen' }
];

/** Currencies a company can open a wallet in besides its own. Mirrors WalletCurrencies.Optional in the API: keep in sync. */
export const WALLET_CURRENCIES: readonly string[] = ['USD', 'CNY', 'JPY', 'NGN'];

/** All IANA time zones the browser knows, falling back to the defaults of the offered countries. */
export function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.('timeZone');
    if (all?.length) return all;
  } catch { /* older browsers */ }
  return [...new Set(COUNTRIES.map((c) => c.timeZone))].sort();
}

export const browserTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export const MODULE_LABELS: Readonly<Record<FeatureCode, string>> = {
  [FEATURES.CORE_POS]: 'Core POS',
  [FEATURES.INVENTORY]: 'Inventory management',
  [FEATURES.RECIPE_DEPLETION]: 'Recipes & volumetric depletion',
  [FEATURES.KDS]: 'Kitchen display (KDS)',
  [FEATURES.BULK_WEIGHED_AUDIT]: 'Bulk weighed audit',
  [FEATURES.ADVANCED_POUR_ANALYTICS]: 'Advanced pour analytics',
  [FEATURES.MULTI_BRANCH_TRANSFERS]: 'Multi-branch transfers',
  [FEATURES.HOTEL_PMS]: 'Hotel PMS / room charging',
  [FEATURES.FINANCIAL_REPORTING]: 'Financial reporting',
  [FEATURES.ADVANCED_ANALYTICS]: 'Advanced analytics',
  [FEATURES.ENTERPRISE_API]: 'Enterprise API & integrations'
};

export const CHECKOUT_STYLE_LABELS: Readonly<Record<string, string>> = {
  'bar-tabs': 'Quick bar tabs',
  'table-service': 'Table service',
  'retail-lanes': 'Retail checkout lanes'
};
