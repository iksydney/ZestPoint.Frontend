/** The owner's daily summary. Mirrors the server's DailySummaryModels. */

export interface SummarySalesDto { net: number; bills: number; average: number; sameDayLastWeekNet: number | null; changePercent: number | null }
export interface SummaryMoneyDto { cash: number; card: number; transfer: number; other: number; tips: number; refunds: number }
export interface SummaryShiftLineDto { who: string; branch: string; openedAtUtc: string; closedAtUtc: string | null; difference: number | null; ranLong: boolean }
export interface SummaryShiftsDto { opened: number; closed: number; stillOpen: number; ranLong: number; cashDifference: number; lines: SummaryShiftLineDto[] }
export interface SummaryExceptionsDto { voids: number; voidedValue: number; discounts: number; paymentUnlocks: number | null; receiptsReprinted: number | null }
export interface SummaryStockDto { lowItems: number; corrections: number; losses: number; deliveries: number }
export interface SummaryTopDto { name: string; quantity: number; net: number }

export interface DailySummaryContent {
  date: string;
  currencyCode: string;
  branchName: string | null;
  sales: SummarySalesDto;
  money: SummaryMoneyDto;
  shifts: SummaryShiftsDto;
  exceptions: SummaryExceptionsDto;
  stock: SummaryStockDto;
  topItems: SummaryTopDto[];
  topGroups: SummaryTopDto[];
  notes: string[];
}

export interface DailySummaryDto { date: string; branchId: string | null; builtAtUtc: string; content: DailySummaryContent }
export interface DailySummaryHeadDto { date: string; net: number; bills: number; changePercent: number | null; voids: number; cashDifference: number }

export interface SummaryRecipientDto {
  id: string;
  membershipId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  sendInApp: boolean;
  sendEmail: boolean;
  sendSms: boolean;
  sendWhatsApp: boolean;
  branchId: string | null;
  branchName: string;
  isActive: boolean;
}

export interface SummaryChannelDto { channel: string; label: string; ready: boolean; note: string | null }

export interface DailySummarySettingsDto {
  enabled: boolean;
  sendAtMinute: number;
  lastBuiltFor: string | null;
  timeZoneId: string;
  recipients: SummaryRecipientDto[];
  channels: SummaryChannelDto[];
}

export interface SaveSummaryRecipientRequest {
  membershipId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  sendInApp: boolean;
  sendEmail: boolean;
  sendSms: boolean;
  sendWhatsApp: boolean;
  branchId: string | null;
  isActive: boolean;
}
