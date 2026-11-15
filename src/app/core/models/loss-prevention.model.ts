/** Loss prevention: unusual events found in what is recorded, how they add up, and their review. Mirrors the server's RiskModels. */

export type RiskAlertState = 'Open' | 'Reviewed';
export type RiskOutcome = 'NoConcern' | 'FollowedUp';

export interface RiskRuleDto {
  key: string;
  title: string;
  explanation: string;
  /** count, percent, minutes, hours, amount, or any (no number: one event is enough). */
  unit: string;
  threshold: number;
  weight: number;
  enabled: boolean;
  defaultThreshold: number;
  defaultWeight: number;
  changed: boolean;
}

export interface RiskAlertDto {
  id: string;
  ruleKey: string;
  ruleTitle: string;
  branchId: string | null;
  branchName: string | null;
  membershipId: string | null;
  personName: string | null;
  occurredAtUtc: string;
  value: number | null;
  threshold: number;
  weight: number;
  summary: string;
  referenceType: string | null;
  referenceId: string | null;
  state: RiskAlertState;
  outcome: RiskOutcome | null;
  reviewedByName: string | null;
  reviewedAtUtc: string | null;
  reviewNote: string | null;
}

export interface RiskScoreDto {
  id: string | null;
  name: string;
  points: number;
  events: number;
  bills: number;
  /** Points for each 100 bills; null when there were too few bills to say. */
  perHundredBills: number | null;
  rank: number;
  why: string;
}

export interface RiskDayDto { date: string; events: number; points: number }

export interface RiskOverviewDto {
  from: string;
  to: string;
  openAlerts: number;
  reviewedAlerts: number;
  people: RiskScoreDto[];
  branches: RiskScoreDto[];
  days: RiskDayDto[];
  notes: string[];
}

export interface SaveRiskRuleRequest { enabled: boolean; threshold: number; weight: number }
