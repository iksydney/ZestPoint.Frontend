import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { NavDefinition } from '../../core/navigation/app-nav';
import { helpFor, menuLabel } from '../../core/navigation/nav-layout';
import { NavService } from '../../core/navigation/nav.service';

/**
 * The reports of one area (Sell, Stock, Purchasing ...) on one page, each with a line saying what it shows. It lists only the reports
 * this person may open; each report's own route and API are guarded as before, so this page grants nothing.
 */
@Component({
  selector: 'zp-report-hub',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (section(); as s) {
      <div class="mb-4" [attr.data-testid]="'hub-' + s.area.key">
        <h1 class="text-2xl font-bold tracking-tight">{{ s.area.label }} reports</h1>
        <p class="mt-1 text-sm text-ink/70">{{ s.area.blurb }}</p>
      </div>
      <div class="mb-4">
        <label class="sr-only" for="hub-filter">Find a report</label>
        <input id="hub-filter" type="search" class="app-input max-w-sm" placeholder="Find a report" autocomplete="off" data-testid="hub-filter" [value]="filter()" (input)="filter.set($any($event.target).value)" />
      </div>
      <ul class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3" data-testid="hub-list" data-tour="hub-list">
        @for (r of shown(); track r.key) {
          <li><a class="app-card app-focus flex h-full flex-col gap-1 no-underline transition hover:border-primary/60" [routerLink]="r.route" [attr.data-nav]="r.key">
            <span class="font-semibold">{{ label(r) }}</span>
            <span class="text-sm text-ink/70">{{ help(r) }}</span>
          </a></li>
        } @empty { <li class="text-sm text-ink/70 sm:col-span-2 xl:col-span-3" role="status">No report matches "{{ filter() }}".</li> }
      </ul>
    } @else {
      <h1 class="text-2xl font-bold">Reports</h1>
      <p class="sys-alert sys-alert-warning mt-3" role="status" data-testid="hub-none">There are no reports here that you may open.</p>
    }
  `
})
export class ReportHubComponent {
  private readonly nav = inject(NavService);
  private readonly area = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('area'))), { initialValue: null });

  protected readonly filter = signal('');
  protected readonly section = computed(() => {
    const s = this.nav.section(this.area());
    return s && s.reports.length > 0 ? s : null;
  });
  protected readonly shown = computed<readonly NavDefinition[]>(() => {
    const text = this.filter().trim().toLowerCase();
    const all = this.section()?.reports ?? [];
    return text ? all.filter((r) => `${menuLabel(r)} ${r.label} ${helpFor(r)}`.toLowerCase().includes(text)) : all;
  });

  protected label = (n: NavDefinition): string => menuLabel(n);
  protected help = (n: NavDefinition): string => helpFor(n);
}
