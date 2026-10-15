import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injectable, effect, inject, input, output, signal, viewChild } from '@angular/core';

// ---- Toasts ---------------------------------------------------------------------------------

export interface Toast {
  readonly id: number;
  readonly kind: 'success' | 'error' | 'info';
  readonly text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private next = 1;
  private readonly _toasts = signal<readonly Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(text: string): void { this.push('success', text); }
  error(text: string): void { this.push('error', text, 8000); }
  info(text: string): void { this.push('info', text); }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: Toast['kind'], text: string, ms = 4500): void {
    const id = this.next++;
    this._toasts.update((list) => [...list, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}

/** Polite live region for transient messages. Colours are fixed (system states are not tenant-themeable). */
@Component({
  selector: 'zp-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite" aria-atomic="false">
      @for (t of toasts.toasts(); track t.id) {
        <div class="pointer-events-auto sys-alert flex items-start justify-between gap-2 shadow-lg" [class]="'sys-alert-' + (t.kind === 'error' ? 'danger' : t.kind)" [attr.role]="t.kind === 'error' ? 'alert' : 'status'">
          <span>{{ t.text }}</span>
          <button type="button" class="shrink-0 font-bold" aria-label="Dismiss" (click)="toasts.dismiss(t.id)">x</button>
        </div>
      }
    </div>
  `
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}

// ---- Confirm --------------------------------------------------------------------------------

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private resolver: ((ok: boolean) => void) | null = null;
  private readonly _request = signal<ConfirmRequest | null>(null);
  readonly request = this._request.asReadonly();

  ask(request: ConfirmRequest): Promise<boolean> {
    this.resolver?.(false);
    this._request.set(request);
    return new Promise<boolean>((resolve) => (this.resolver = resolve));
  }

  answer(ok: boolean): void {
    this._request.set(null);
    this.resolver?.(ok);
    this.resolver = null;
  }
}

// ---- Dialog ---------------------------------------------------------------------------------

/**
 * Modal dialog: focus moves in on open and is restored on close, Escape and the backdrop close it, Tab stays inside.
 * Content is projected; the title is the accessible name.
 */
@Component({
  selector: 'zp-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" (mousedown)="onBackdrop($event)">
        <div #panel class="app-card max-h-[90vh] w-full overflow-auto shadow-2xl" [class]="wide() ? 'max-w-3xl' : 'max-w-lg'"
             role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1" (keydown)="onKey($event)">
          <div class="mb-3 flex items-start justify-between gap-3">
            <h2 class="text-lg font-bold">{{ title() }}</h2>
            <button type="button" class="btn-ghost -mr-2 -mt-1 px-2" aria-label="Close" (click)="closed.emit()">x</button>
          </div>
          <ng-content />
        </div>
      </div>
    }
  `
})
export class DialogComponent {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.previouslyFocused = document.activeElement as HTMLElement | null;
        queueMicrotask(() => this.focusFirst());
      } else {
        this.previouslyFocused?.focus?.();
        this.previouslyFocused = null;
      }
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) this.closed.emit();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const items = this.focusable();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  private focusable(): HTMLElement[] {
    const root = this.panel()?.nativeElement;
    return root ? Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((e) => !e.hasAttribute('disabled')) : [];
  }

  private focusFirst(): void {
    const items = this.focusable().filter((e) => e.getAttribute('aria-label') !== 'Close');
    (items[0] ?? this.panel()?.nativeElement)?.focus();
  }
}

/** Renders the pending ConfirmService request as a dialog. Mounted once, in the application shell. */
@Component({
  selector: 'zp-confirm-host',
  standalone: true,
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <zp-dialog [open]="!!confirm.request()" [title]="confirm.request()?.title ?? ''" (closed)="confirm.answer(false)">
      <p class="text-sm text-ink/90">{{ confirm.request()?.message }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn-ghost" (click)="confirm.answer(false)">Cancel</button>
        <button type="button" [class]="confirm.request()?.danger ? 'inline-flex items-center rounded-lg bg-danger px-4 py-2 font-semibold text-canvas' : 'btn-primary'" (click)="confirm.answer(true)" data-testid="confirm-ok">
          {{ confirm.request()?.confirmLabel ?? 'Confirm' }}
        </button>
      </div>
    </zp-dialog>
  `
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
}
