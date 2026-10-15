import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../core/services/api.util';
import { ContactPayload } from './validation';

export class IntakeError extends Error {}

/**
 * Newsletter and demo-request submissions. They are stored by the server (POST /api/v1/public/newsletter|contact), so a visitor is only
 * told "thanks" when the server really has the request. If it could not be saved the form shows an error and keeps what was typed.
 */
@Injectable({ providedIn: 'root' })
export class PublicIntakeService {
  private readonly http = inject(HttpClient);

  subscribe(email: string, website: string): Promise<void> {
    return this.post('/api/v1/public/newsletter', { email: email.trim().toLowerCase(), website });
  }

  contact(payload: ContactPayload): Promise<void> {
    return this.post('/api/v1/public/contact', payload);
  }

  private async post(url: string, body: unknown): Promise<void> {
    try {
      await firstValueFrom(this.http.post(url, body));
    } catch (err) {
      const e = toApiError(err);
      if (e.status === 429) throw new IntakeError('Too many attempts. Please try again shortly.');
      if (e.status === 0) throw new IntakeError('We could not reach the server. Check your connection and try again.');
      throw new IntakeError(e.status === 400 ? e.message : 'Something went wrong. Please try again.');
    }
  }
}
