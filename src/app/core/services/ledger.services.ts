import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { unwrap } from './api.util';

export type LedgerAccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export const LEDGER_ACCOUNT_TYPES: readonly { value: LedgerAccountType; label: string; hint: string }[] = [
  { value: 'Asset', label: 'Asset', hint: 'What the company has: cash, bank, stock.' },
  { value: 'Liability', label: 'Liability', hint: 'What the company owes: suppliers, tax, tips.' },
  { value: 'Equity', label: 'Equity', hint: 'Opening balances and the owner’s stake.' },
  { value: 'Income', label: 'Income', hint: 'Sales.' },
  { value: 'Expense', label: 'Expense', hint: 'Cost of goods sold, losses and other costs.' }
];

export interface LedgerAccountDto {
  id: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  description: string | null;
  isActive: boolean;
  /** The system posts to this account itself: it cannot be switched off or change kind. */
  isSystem: boolean;
  /** Its balance today, the natural way round for its kind. */
  balance: number;
  rowVersion: string;
}

/** An account as the pick-lists on the stock card and the stock group need it. */
export interface LedgerAccountOptionDto { id: string; code: string; name: string; type: LedgerAccountType; isDefaultSales: boolean; isDefaultStock: boolean }

export interface SaveLedgerAccountRequest { code: string; name: string; type: LedgerAccountType; description: string | null; isActive: boolean; rowVersion?: string | null }

export interface LedgerStatusDto { caughtUp: boolean; lastSyncedAtUtc: string | null; journalCount: number; posted: number }

@Injectable({ providedIn: 'root' })
export class LedgerApi {
  private readonly http = inject(HttpClient);

  accounts(includeInactive = false): Observable<LedgerAccountDto[]> {
    return this.http.get<ApiEnvelope<LedgerAccountDto[]>>('/api/v1/ledger/accounts', { params: { includeInactive } }).pipe(unwrap());
  }

  saveAccount(id: string | null, body: SaveLedgerAccountRequest): Observable<LedgerAccountDto> {
    return id
      ? this.http.put<ApiEnvelope<LedgerAccountDto>>(`/api/v1/ledger/accounts/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<LedgerAccountDto>>('/api/v1/ledger/accounts', body).pipe(unwrap());
  }

  /** Posts whatever has happened since the ledger was last brought up to date, including history not posted yet. */
  sync(): Observable<LedgerStatusDto> {
    return this.http.post<ApiEnvelope<LedgerStatusDto>>('/api/v1/ledger/accounts/sync', {}).pipe(unwrap());
  }

  /** The accounts a stock card or a stock group can be pointed at (needs only the right to see inventory). */
  options(): Observable<LedgerAccountOptionDto[]> {
    return this.http.get<ApiEnvelope<LedgerAccountOptionDto[]>>('/api/v1/inventory/account-options').pipe(unwrap());
  }
}
