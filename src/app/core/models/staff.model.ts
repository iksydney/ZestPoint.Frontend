/** Staff, roles, branches and audit contracts (ZestPoint.Data/ViewModel/StaffModels.cs). Enums travel as string names. */

export type MembershipStatus = 'Invited' | 'Active' | 'Deactivated';
export type CredentialType = 'Pin' | 'Rfid';

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface PermissionDto {
  readonly key: string;
  readonly group: string;
  readonly description: string;
}

export interface RoleDto {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly isSystem: boolean;
  readonly systemKey: string | null;
  readonly isSuperAdmin: boolean;
  readonly permissions: readonly string[];
  readonly memberCount: number;
  /** The stations (kitchen, bar, ...) this role works at: its holders hear and see only those stations' orders. Empty = every station. */
  readonly stationIds: readonly string[];
  /** False when the caller may not edit this role (owner role, or it holds permissions the caller lacks). */
  readonly canEdit: boolean;
  readonly rowVersion: string;
}

export interface SaveRoleRequest {
  name: string;
  description: string | null;
  permissions: string[];
  /** Omitted = left as it is. */
  stationIds?: string[];
  rowVersion?: string | null;
}

export interface BranchDto {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly address: string | null;
  readonly timeZoneId: string | null;
  readonly isHeadOffice: boolean;
  readonly isActive: boolean;
  /** Only on the answer to creating a branch: the people who worked at every branch and now work only at the branches they had. */
  readonly limitedStaff?: readonly LimitedStaffDto[] | null;
}

/** A person a new branch took away from "every branch" (owner's decision, 2026-11-22). */
export interface LimitedStaffDto {
  readonly membershipId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

/** Who works at one branch: the "Who works at this branch?" window. */
export interface BranchStaffDto {
  readonly branchId: string;
  readonly branchName: string;
  /** Only someone who works at every branch may give a person every branch. */
  readonly canGiveEveryBranch: boolean;
  readonly staff: readonly BranchStaffMemberDto[];
}

export interface BranchStaffMemberDto {
  readonly membershipId: string;
  readonly displayName: string;
  readonly staffCode: string;
  readonly roles: readonly string[];
  readonly isOwner: boolean;
  /** Works at every branch (the owner always does). */
  readonly hasAllBranches: boolean;
  /** Works at this branch, by name or because they work at every branch. */
  readonly worksHere: boolean;
  readonly isYou: boolean;
}

export interface SetBranchStaffRequest {
  /** The people who should work at the branch, among those who have a list of branches; anyone left out who works there now is taken off it. */
  membershipIds: string[];
  /** People to switch to "every branch". */
  everyBranch: string[];
}

export interface SaveBranchRequest {
  name: string;
  code: string;
  address: string | null;
  timeZoneId: string | null;
  isActive: boolean;
}

export interface StaffListItemDto {
  readonly id: string;
  readonly displayName: string;
  /** Sign-in code formatted "BHL-007". */
  readonly staffCode: string;
  readonly email: string | null;
  readonly status: MembershipStatus;
  readonly isOwner: boolean;
  readonly roles: readonly string[];
  readonly hasAllBranches: boolean;
  readonly branches: readonly string[];
  readonly hasPin: boolean;
  readonly hasRfid: boolean;
  readonly pinLocked: boolean;
  readonly invitePending: boolean;
  readonly inviteExpired: boolean;
  readonly lastActivityAtUtc: string | null;
  readonly dateCreated: string;
}

export interface StaffDetailDto extends StaffListItemDto {
  readonly roleIds: readonly string[];
  readonly branchIds: readonly string[];
  readonly activeSessions: number;
  readonly rowVersion: string;
}

export interface CreateStaffRequest {
  displayName: string;
  email: string | null;
  roleIds: string[];
  hasAllBranches: boolean;
  branchIds: string[];
  pin: string | null;
  sendInvitation: boolean;
}

export interface StaffCreatedDto {
  readonly staff: StaffDetailDto;
  /** Only present outside production, so development can finish the invitation flow without a mail server. */
  readonly devInviteLink: string | null;
  /** The default PIN that went out in the invitation. Same development-only exposure as devInviteLink. */
  readonly devDefaultPin: string | null;
}

export interface UpdateStaffRequest {
  displayName: string;
  roleIds: string[];
  hasAllBranches: boolean;
  branchIds: string[];
  rowVersion: string | null;
}

export interface SessionDto {
  readonly id: string;
  readonly createdAtUtc: string;
  readonly lastSeenAtUtc: string | null;
  readonly expiresAtUtc: string;
  readonly authMethod: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly isCurrent: boolean;
  /** A session on the phone app: what the person calls the phone, its system (android, ios, windows) and the app's version. Null for a browser. */
  readonly deviceName: string | null;
  readonly platform: string | null;
  readonly appVersion: string | null;
}

export interface InviteInfoDto {
  readonly displayName: string;
  readonly companyName: string;
  readonly requiresPassword: boolean;
  /** True when the invitation carried a default PIN: the person enters it once and chooses their own. */
  readonly requiresCurrentPin: boolean;
}

export interface AuditLogDto {
  readonly id: string;
  readonly occurredAtUtc: string;
  readonly actorName: string | null;
  readonly actorMembershipId: string | null;
  readonly action: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly detailsJson: string | null;
  readonly ipAddress: string | null;
}
