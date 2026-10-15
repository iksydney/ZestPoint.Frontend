import { Pipe, PipeTransform, inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Times are stored and sent in UTC. This shows them in the company's configured time zone, so "ends on 14 Oct" means the company's
 * 14 Oct, not the viewer's browser or the server's.
 */
@Pipe({ name: 'tenantTime', standalone: true })
export class TenantTimePipe implements PipeTransform {
  private readonly auth = inject(AuthService);

  transform(value: string | Date | null | undefined, style: 'date' | 'datetime' = 'datetime'): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`) : value;
    if (Number.isNaN(date.getTime())) return '';
    const timeZone = this.auth.tenant()?.timeZoneId || 'UTC';
    try {
      return new Intl.DateTimeFormat('en-GB', style === 'date'
        ? { timeZone, day: '2-digit', month: 'short', year: 'numeric' }
        : { timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
    } catch {
      return date.toISOString(); // an unknown zone id must not break the screen
    }
  }
}
