import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { SITE } from '../site';

export interface LegalSectionData {
  id: string;
  title: string;
  /** Trusted, developer-authored HTML (sanitised by Angular on binding). */
  html: string;
}

/** Shared shell for long-form legal documents: title, table of contents, numbered sections. */
@Component({
  selector: 'zp-legal-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container-page py-16 sm:py-20">
      <header class="mx-auto max-w-3xl">
        <p class="eyebrow">Legal</p>
        <h1 class="mt-3 text-4xl font-bold sm:text-5xl">{{ title() }}</h1>
        <p class="mt-3 text-sm text-slate-600 dark:text-slate-400">Last updated: {{ lastUpdated }}</p>
        <div class="mt-6 space-y-4 text-lg">
          <ng-content />
        </div>
      </header>

      <div class="mx-auto mt-12 grid max-w-6xl gap-10 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Table of contents" class="lg:sticky lg:top-24 lg:self-start">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-navy-900 dark:text-white">Contents</h2>
          <ol class="space-y-1.5 text-sm">
            @for (s of sections(); track s.id; let i = $index) {
              <li>
                <a [href]="'#' + s.id" (click)="jump($event, s.id)" class="text-slate-700 hover:text-brand dark:text-slate-400 dark:hover:text-glow-400">{{ i + 1 }}. {{ s.title }}</a>
              </li>
            }
          </ol>
        </nav>

        <article
          class="max-w-3xl space-y-10 [&_a]:text-brand [&_a]:underline dark:[&_a]:text-glow-400 [&_li]:leading-relaxed [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6"
          (click)="interceptLinks($event)"
        >
          @for (s of sections(); track s.id; let i = $index) {
            <section [id]="s.id" class="scroll-mt-24 space-y-3">
              <h2 class="text-2xl font-bold">{{ i + 1 }}. {{ s.title }}</h2>
              <div class="space-y-3" [innerHTML]="s.html"></div>
            </section>
          }
        </article>
      </div>
    </div>
  `
})
export class LegalLayoutComponent {
  private readonly router = inject(Router);

  readonly title = input.required<string>();
  readonly sections = input.required<readonly LegalSectionData[]>();
  protected readonly lastUpdated = SITE.lastUpdated;

  protected jump(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  /** Keep in-app links inside the SPA (e.g. Terms -> /privacy) instead of forcing a full reload. */
  protected interceptLinks(event: MouseEvent): void {
    const a = (event.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href || !href.startsWith('/') || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    void this.router.navigateByUrl(href);
  }
}
