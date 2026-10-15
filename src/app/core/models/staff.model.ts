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
  /** False when the caller may not edit this role (owner role, or it holds permissions the caller lacks). */
  readonly canEdit: boolean;
  readonly rowVersion: string;
}

export interface SaveRoleRequest {
  name: string;
  description: string | null;
  permissions: string[];
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
  readonly staffCode: number;
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
