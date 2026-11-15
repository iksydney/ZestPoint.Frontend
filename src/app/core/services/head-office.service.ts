import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { BranchComparisonDto, ComparisonQuery } from '../models/head-office.model';
import { unwrap } from './api.util';

/** Head office. Every call is authorised by the server (right, module and the person's own branches); the screen only shapes what is shown. */
@Injectable({ providedIn: 'root' })
export class HeadOfficeApi {
  private readonly http = inject(HttpClient);

  comparison(query: ComparisonQuery): Observable<BranchComparisonDto> {
    let params = new HttpParams();
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    if (query.measure) params = params.set('measure', query.measure);
    if (query.bucket && query.bucket !== 'auto') params = params.set('bucket', query.bucket);
    if (query.branches?.length) params = params.set('branches', query.branches.join(','));
    return this.http.get<ApiEnvelope<BranchComparisonDto>>('/api/v1/head-office/comparison', { params }).pipe(unwrap());
  }
}
