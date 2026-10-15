import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApiEnvelope, BrandingDto, BrandingStateDto, CompanyProfileDto, EnterpriseTypeDto, UpdateCompanyProfileRequest, OnboardingProgressDto, OnboardingStep, PublicBrandingDto,
  RegisterCompanyRequest, RegistrationResult, SaveBrandingRequest, SlugAvailabilityDto, ThemePresetDto, ThemeSuggestionDto
} from '../models/api.model';
import { unwrap } from './api.util';

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly http = inject(HttpClient);

  enterpriseTypes(): Observable<EnterpriseTypeDto[]> {
    return this.http.get<ApiEnvelope<EnterpriseTypeDto[]>>('/api/v1/registration/enterprise-types').pipe(unwrap());
  }

  checkSlug(slug: string): Observable<SlugAvailabilityDto> {
    const params = new HttpParams().set('slug', slug);
    return this.http.get<ApiEnvelope<SlugAvailabilityDto>>('/api/v1/registration/slug-availability', { params }).pipe(unwrap());
  }

  register(request: RegisterCompanyRequest): Observable<RegistrationResult> {
    return this.http.post<ApiEnvelope<RegistrationResult>>('/api/v1/registration', request).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);

  get(): Observable<OnboardingProgressDto> {
    return this.http.get<ApiEnvelope<OnboardingProgressDto>>('/api/v1/onboarding').pipe(unwrap());
  }

  saveState(resumeStateJson: string | null, currentStep?: OnboardingStep): Observable<OnboardingProgressDto> {
    return this.http
      .put<ApiEnvelope<OnboardingProgressDto>>('/api/v1/onboarding/state', { resumeStateJson, currentStep: currentStep ?? null })
      .pipe(unwrap());
  }

  completeStep(step: OnboardingStep): Observable<OnboardingProgressDto> {
    return this.http.post<ApiEnvelope<OnboardingProgressDto>>('/api/v1/onboarding/steps/complete', { step }).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class BrandingApiService {
  private readonly http = inject(HttpClient);

  state(): Observable<BrandingStateDto> {
    return this.http.get<ApiEnvelope<BrandingStateDto>>('/api/v1/branding').pipe(unwrap());
  }

  presets(): Observable<ThemePresetDto[]> {
    return this.http.get<ApiEnvelope<ThemePresetDto[]>>('/api/v1/branding/presets').pipe(unwrap());
  }

  saveDraft(request: SaveBrandingRequest): Observable<BrandingDto> {
    return this.http.put<ApiEnvelope<BrandingDto>>('/api/v1/branding/draft', request).pipe(unwrap());
  }

  discardDraft(): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>('/api/v1/branding/draft').pipe(unwrap());
  }

  publish(): Observable<BrandingDto> {
    return this.http.post<ApiEnvelope<BrandingDto>>('/api/v1/branding/publish', null).pipe(unwrap());
  }

  upload(kind: 'logo' | 'favicon', file: File): Observable<BrandingDto> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ApiEnvelope<BrandingDto>>(`/api/v1/branding/media/${kind}`, form).pipe(unwrap());
  }

  removeMedia(kind: 'logo' | 'favicon'): Observable<BrandingDto> {
    return this.http.delete<ApiEnvelope<BrandingDto>>(`/api/v1/branding/media/${kind}`).pipe(unwrap());
  }

  suggest(primaryColor: string, dark: boolean, harmony: string): Observable<ThemeSuggestionDto> {
    return this.http
      .post<ApiEnvelope<ThemeSuggestionDto>>('/api/v1/branding/suggest', { primaryColor, dark, harmony })
      .pipe(unwrap());
  }

  /** The sign-in screen's venue theme (published only). */
  publicBranding(slug: string): Observable<PublicBrandingDto> {
    return this.http.get<ApiEnvelope<PublicBrandingDto>>(`/api/v1/public/${encodeURIComponent(slug)}/branding`).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class CompanyApiService {
  private readonly http = inject(HttpClient);

  get(): Observable<CompanyProfileDto> {
    return this.http.get<ApiEnvelope<CompanyProfileDto>>('/api/v1/company').pipe(unwrap());
  }

  update(request: UpdateCompanyProfileRequest): Observable<CompanyProfileDto> {
    return this.http.put<ApiEnvelope<CompanyProfileDto>>('/api/v1/company', request).pipe(unwrap());
  }
}
