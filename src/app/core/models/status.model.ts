/** The public status page and the operator console's incident posting (ZestPoint.Data/ViewModel/StatusModels.cs). Enums travel as their string names. */

/** Working, Slow or Down are answers from the checks; Unknown means no check has been made lately; None is a day with no checks. */
export type StatusLevel = 'Working' | 'Slow' | 'Down' | 'Unknown' | 'None';
export type IncidentImpact = 'Slow' | 'Down';
export type IncidentStatus = 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';

export const INCIDENT_IMPACTS: readonly IncidentImpact[] = ['Slow', 'Down'];
export const INCIDENT_STATUSES: readonly IncidentStatus[] = ['Investigating', 'Identified', 'Monitoring', 'Resolved'];

/** Plain words for the screens. "Down" reads as "Not working": that is what a customer is asking. */
export const LEVEL_LABEL: Readonly<Record<StatusLevel, string>> = { Working: 'Working', Slow: 'Slow', Down: 'Not working', Unknown: 'Not checked lately', None: 'No data' };
export const IMPACT_LABEL: Readonly<Record<IncidentImpact, string>> = { Slow: 'Slow or partly working', Down: 'Not working' };
export const INCIDENT_STATUS_LABEL: Readonly<Record<IncidentStatus, string>> = { Investigating: 'Investigating', Identified: 'Found the cause', Monitoring: 'Fixed, watching', Resolved: 'Resolved' };

export interface StatusDayDto { day: string; checks: number; working: number; slow: number; down: number; level: StatusLevel }

export interface StatusPartDto {
  key: string;
  name: string;
  /** What is checked, in words. */
  checked: string;
  level: StatusLevel;
  detail: string | null;
  checkedAtUtc: string | null;
  latencyMs: number;
  /** Share of the last 30 days' checks in which the part was working (slow counts as working, down does not). Null with no checks. */
  availability30: number | null;
  checks30: number;
  /** The last 90 days, oldest first. */
  history: StatusDayDto[];
}

export interface StatusIncidentUpdateDto { status: IncidentStatus; message: string; atUtc: string; byName: string }

export interface StatusIncidentDto {
  id: string;
  title: string;
  partKeys: string[];
  /** The affected parts, named in words. */
  parts: string[];
  impact: IncidentImpact;
  status: IncidentStatus;
  startedAtUtc: string;
  resolvedAtUtc: string | null;
  updates: StatusIncidentUpdateDto[];
}

export interface PublicStatusDto {
  overall: StatusLevel;
  overallText: string;
  generatedAtUtc: string;
  /** The first check on record: how long the figures have been measured. */
  monitoringSinceUtc: string | null;
  parts: StatusPartDto[];
  open: StatusIncidentDto[];
  /** Resolved in the last 30 days. */
  recent: StatusIncidentDto[];
}

/** What the banner inside the application needs. */
export interface StatusSummaryDto { overall: StatusLevel; open: StatusIncidentDto[] }

export interface OpenIncidentRequest { title: string; parts: string[]; impact: IncidentImpact; message: string }
export interface IncidentUpdateRequest { status: IncidentStatus; message: string }
