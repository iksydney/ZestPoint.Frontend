import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { StationDto } from '../models/ops.model';
import { unwrap } from './api.util';
import { AuthService } from './auth.service';

/**
 * The stations in use, by name, for the pickers on the stock group and stock card screens. Read once per signed-in person and kept.
 *
 * The list belongs to a company (names) AND to the person (`worksHere`), and signing out is an in-app navigation that does not reload the page,
 * so a service that kept its first answer for the whole page session showed one company's station names to the next company, or the next person's
 * stations to the one after them. The list therefore remembers who it was read for (company and person): for anyone else it is empty at once
 * and `loaded` is false, and the next `load()` reads it again. Nothing is asked of the server before somebody is signed in.
 */
@Injectable({ providedIn: 'root' })
export class StationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly _list = signal<readonly StationDto[]>([]);
  private readonly _loaded = signal(false);
  /** Who the list in `_list` was read for: `<company>:<person>`. */
  private readonly readFor = signal<string | null>(null);
  private loading: Promise<void> | null = null;

  private readonly who = computed(() => {
    const company = this.auth.tenantId();
    const person = this.auth.membership()?.id;
    return company && person ? `${company}:${person}` : null;
  });

  readonly list = computed<readonly StationDto[]>(() => (this.readFor() === this.who() ? this._list() : []));
  /** The list was read at least once for this person: until then an empty list means "not known yet", not "no stations". */
  readonly loaded = computed(() => this.readFor() === this.who() && this._loaded());

  load(force = false): Promise<void> {
    const who = this.who();
    if (!who) return Promise.resolve();
    if (this.readFor() !== who) {
      // Somebody else's answer (or none yet): drop it now, and read for this person.
      this.readFor.set(who);
      this._list.set([]);
      this._loaded.set(false);
      this.loading = null;
    }
    if (this.loading && !force) return this.loading;
    this.loading = firstValueFrom(this.http.get<ApiEnvelope<StationDto[]>>('/api/v1/me/stations').pipe(unwrap()))
      .then((l) => { if (this.readFor() === who) { this._list.set(l); this._loaded.set(true); } })   // an answer that arrives after someone else signed in is thrown away
      .catch(() => undefined);
    return this.loading;
  }
}
