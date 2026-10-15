/** Support, CRM, user-care and operator contracts (ZestPoint.Data/ViewModel/SupportModels.cs). Enums travel as their string names. */

import type { PagedResult } from './staff.model';

export type { PagedResult };

export type PlatformRole = 'SupportAgent' | 'SupportLead' | 'Admin';
export type TicketStatus = 'Open' | 'AwaitingCustomer' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type TicketCategory = 'Billing' | 'Technical' | 'Account' | 'HowTo' | 'Feedback' | 'Other';
export type MessageAuthorKind = 'Customer' | 'Operator' | 'System';
export type CrmStage = 'Lead' | 'Trial' | 'Onboarding' | 'Active' | 'AtRisk' | 'Churned';
export type CrmNoteKind = 'Note' | 'Call' | 'Email' | 'Meeting';

export const TICKET_STATUSES: readonly TicketStatus[] = ['Open', 'AwaitingCustomer', 'Resolved', 'Closed'];
export const TICKET_PRIORITIES: readonly TicketPriority[] = ['Low', 'Normal', 'High', 'Urgent'];
export const TICKET_CATEGORIES: readonly TicketCategory[] = ['Billing', 'Technical', 'Account', 'HowTo', 'Feedback', 'Other'];
export const CRM_STAGES: readonly CrmStage[] = ['Lead', 'Trial', 'Onboarding', 'Active', 'AtRisk', 'Churned'];
export const CRM_NOTE_KINDS: readonly CrmNoteKind[] = ['Note', 'Call', 'Email', 'Meeting'];

/** Plain labels for the screens (the wire names are CamelCase). */
export const STATUS_LABEL: Readonly<Record<TicketStatus, string>> = { Open: 'Open', AwaitingCustomer: 'Waiting for customer', Resolved: 'Resolved', Closed: 'Closed' };
export const CATEGORY_LABEL: Readonly<Record<TicketCategory, string>> = { Billing: 'Billing', Technical: 'Technical problem', Account: 'Account and access', HowTo: 'How do I...', Feedback: 'Feedback', Other: 'Other' };
export const STAGE_LABEL: Readonly<Record<CrmStage, string>> = { Lead: 'Lead', Trial: 'Trial', Onboarding: 'Onboarding', Active: 'Active', AtRisk: 'At risk', Churned: 'Churned' };
export const ROLE_LABEL: Readonly<Record<PlatformRole, string>> = { SupportAgent: 'Support agent', SupportLead: 'Support lead', Admin: 'Administrator' };

/** What an operator may do. Mirrors ZestPoint.Data/Authorization/PlatformPermissions.cs; the server re-checks every request. */
export const PLATFORM_PERMISSIONS = {
  TICKETS_VIEW: 'platform.tickets.view',
  TICKETS_REPLY: 'platform.tickets.reply',
  TICKETS_MANAGE: 'platform.tickets.manage',
  CRM_VIEW: 'platform.crm.view',
  CRM_WRITE: 'platform.crm.write',
  CRM_MANAGE: 'platform.crm.manage',
  USERS_VIEW: 'platform.users.view',
  USERS_MANAGE: 'platform.users.manage',
  BILLING_MANAGE: 'platform.billing.manage',
  OPERATORS_MANAGE: 'platform.operators.manage'
} as const;

export interface CreateTicketRequest { subject: string; category: TicketCategory; priority: TicketPriority; body: string; idempotencyKey?: string | null }
export interface TicketReplyRequest { body: string; idempotencyKey?: string | null }

export interface TicketMessageDto {
  id: string;
  authorKind: MessageAuthorKind;
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAtUtc: string;
  /** Operators only. */
  emailStatus: string | null;
}

export interface TicketListItemDto {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterName: string;
  createdAtUtc: string;
  lastActivityAtUtc: string;
  tenantId: string | null;
  companyName: string | null;
  companySlug: string | null;
  assignedToAdminId: string | null;
  assignedToName: string | null;
}

export interface TicketDetailDto {
  ticket: TicketListItemDto;
  requesterEmail: string | null;
  firstResponseAtUtc: string | null;
  resolvedAtUtc: string | null;
  closedAtUtc: string | null;
  rowVersion: string;
  messages: TicketMessageDto[];
}

export interface AssignTicketRequestDto { adminId: string | null }
export interface PlatformTicketReplyRequest { body: string; internal: boolean; setStatus?: TicketStatus | null; idempotencyKey?: string | null }

export interface SupportSummaryDto { open: number; awaitingCustomer: number; unassigned: number; urgent: number; myOpen: number; emailConfigured: boolean }

export interface CrmNoteDto { id: string; kind: CrmNoteKind; body: string; authorName: string; createdAtUtc: string }

export interface CrmProfileDto {
  tenantId: string;
  stage: CrmStage;
  ownerAdminId: string | null;
  ownerName: string | null;
  tags: string[];
  nextFollowUpUtc: string | null;
  rowVersion: string;
  notes: CrmNoteDto[];
  openTickets: number;
}

export interface SaveCrmProfileRequest { stage: CrmStage; ownerAdminId: string | null; tags: string[]; nextFollowUpUtc: string | null; rowVersion: string | null }

export interface CrmListItemDto {
  tenantId: string;
  name: string;
  slug: string;
  stage: CrmStage;
  ownerName: string | null;
  tags: string[];
  nextFollowUpUtc: string | null;
  openTickets: number;
  planCode: string | null;
  subscriptionStatus: string | null;
  dateCreated: string;
}

export type MembershipStatus = 'Invited' | 'Active' | 'Deactivated';

export interface PlatformUserListItemDto {
  membershipId: string;
  tenantId: string;
  companyName: string;
  companySlug: string;
  displayName: string;
  email: string | null;
  staffCode: number;
  status: MembershipStatus;
  isOwner: boolean;
  roles: string[];
  activeSessions: number;
  locked: boolean;
  lastSeenAtUtc: string | null;
}

export type PlatformUserAction = 'deactivate' | 'reactivate' | 'unlock' | 'revoke-sessions' | 'send-reset';

export interface PlatformUserActionResultDto { user: PlatformUserListItemDto; message: string }

export interface PlatformOperatorDto { id: string; displayName: string; email: string; role: PlatformRole; isActive: boolean; lastLoginAtUtc: string | null }
export interface CreateOperatorRequest { displayName: string; email: string; role: PlatformRole; initialPassword: string }
export interface UpdateOperatorRequest { role: PlatformRole; isActive: boolean }
