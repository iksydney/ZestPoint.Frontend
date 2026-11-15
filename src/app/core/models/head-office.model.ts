/** Head office: the branch comparison. Mirrors the server's HeadOfficeModels. (The overview is an ordinary report.) */

export type ComparisonMeasure = 'net_sales' | 'bills' | 'average_bill' | 'void_rate' | 'discount_rate' | 'cash_difference' | 'top_items';
export type ComparisonBucket = 'auto' | 'day' | 'week' | 'month';
export type ComparisonUnit = 'money' | 'number' | 'percent';

export interface ComparisonBranchDto { id: string; name: string }

export interface ComparisonPointDto {
  /** First day of the day, week (Monday) or month the point covers, in the company time zone. */
  start: string;
  label: string;
  /** Branch id to its value; null where there is nothing to divide by (drawn as a gap). */
  values: Record<string, number | null>;
}

export interface ComparisonRankDto { rank: number; branchId: string; name: string; value: number | null }
export interface ComparisonItemDto { name: string; quantity: number; net: number }
export interface ComparisonTopItemsDto { branchId: string; name: string; items: ComparisonItemDto[] }

export interface BranchComparisonDto {
  measure: ComparisonMeasure;
  label: string;
  unit: ComparisonUnit;
  currencyCode: string;
  timeZoneId: string;
  from: string;
  to: string;
  bucket: Exclude<ComparisonBucket, 'auto'>;
  /** The branches drawn. */
  branches: ComparisonBranchDto[];
  /** Every branch the person may see. */
  availableBranches: ComparisonBranchDto[];
  points: ComparisonPointDto[];
  ranking: ComparisonRankDto[];
  topItems: ComparisonTopItemsDto[];
  notes: string[];
}

export interface ComparisonQuery {
  from?: string;
  to?: string;
  measure?: ComparisonMeasure;
  bucket?: ComparisonBucket;
  branches?: string[];
}
