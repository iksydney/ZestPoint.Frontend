import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationDto } from '../../core/models/subscription.model';
import { NoticesStore } from '../../core/services/notices.store';

/**
 * The notices bell in the header: what the system has to tell this person (alerts, summaries, messages from the system), newest first, with how many are
 * unread. It is a separate button from the bar's bell, which is about work waiting at the bar. A notice with a link takes the person there.
 */
@Component({
  selector: 'zp-notices-bell',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button type="button" class="btn-ghost relative px-2" data-testid="notices-bell" data-tour="notices" [attr.data-count]="store.unread()" aria-haspopup="dialog" [attr.aria-expanded]="open()"
              [attr.aria-label]="store.unread() ? store.unread() + ' unread notice(s)' : 'Notices'" (click)="toggle()">
        <svg class="h-5 w-5" [class.text-primary]="store.unread() > 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
        @if (store.unread() > 0) { <span class="absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[1.125rem] text-white" aria-hidden="true" data-testid="notices-count">{{ store.unread() > 99 ? '99+' : store.unread() }}</span> }
      </button>
      @if (open()) {
        <div class="absolute right-0 top-full z-40 mt-1 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-ink/15 bg-panel shadow-xl" role="dialog" aria-label="Notices" data-testid="notices-panel">
          <div class="flex items-center justify-between gap-2 border-b border-ink/10 px-3 py-2">
            <h2 class="text-sm font-bold">Notices</h2>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" data-testid="notices-read-all" [disabled]="store.unread() === 0" (click)="store.markAllRead()">Mark all read</button>
          </div>
          <ul class="m-0 max-h-96 list-none overflow-y-auto p-0">
            @for (n of store.latest(); track n.id) {
              <li>
                <button type="button" class="block w-full px-3 py-2 text-left hover:bg-ink/5" [attr.data-testid]="'notice-' + n.title" [attr.data-unread]="!n.readAtUtc" (click)="choose(n)">
                  <span class="flex items-start gap-2">
                    <span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" [class]="n.readAtUtc ? 'bg-ink/20' : 'bg-primary'" aria-hidden="true"></span>
                    <span class="min-w-0">
                      <span class="block text-sm" [class.font-semibold]="!n.readAtUtc">{{ n.title }}@if (n.level !== 'Info') { <span class="app-badge ml-1" [class.app-badge-warning]="n.level === 'Warning'" [class.app-badge-danger]="n.level === 'Critical'">{{ n.level === 'Critical' ? 'Urgent' : 'Warning' }}</span> }</span>
                      <span class="block text-xs text-ink/80">{{ n.body }}</span>
                      <span class="block text-[11px] text-ink/60">{{ n.dateCreated | date: 'd MMM, HH:mm' }}</span>
                    </span>
                  </span>
                </button>
              </li>
            } @empty { <li class="px-3 py-6 text-center text-sm text-ink/70" data-testid="notices-empty">Nothing to tell you right now.</li> }
          </ul>
        </div>
      }
    </div>
  `
})
export class NoticesBellComponent implements OnInit {
  protected readonly store = inject(NoticesStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);

  protected readonly open = signal(false);

  ngOnInit(): void {
    void this.store.refresh();
    const timer = setInterval(() => void this.store.refresh(), 60_000);
    this.destroy.onDestroy(() => clearInterval(timer));
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) void this.store.refresh();
  }

  protected async choose(n: NotificationDto): Promise<void> {
    await this.store.markRead(n.id);
    this.open.set(false);
    if (n.link && n.link.startsWith('/app/')) await this.router.navigateByUrl(n.link);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(ev: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void { this.open.set(false); }
}
