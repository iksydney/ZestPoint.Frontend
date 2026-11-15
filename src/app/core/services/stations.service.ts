import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { StationDto } from '../models/ops.model';
import { unwrap } from './api.util';

/** The stations in use, by name, for the pickers on the stock group and stock card screens. Read once per session and kept. */
@Injectable({ providedIn: 'root' })
export class StationsService {
  private readonly http = inject(HttpClient);
  private readonly _list = signal<readonly StationDto[]>([]);
  private loading: Promise<void> | null = null;

  readonly list = this._list.asReadonly();

  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    this.loading = firstValueFrom(this.http.get<ApiEnvelope<StationDto[]>>('/api/v1/me/stations').pipe(unwrap()))
      .then((l) => this._list.set(l))
      .catch(() => undefined);
    return this.loading;
  }
}
