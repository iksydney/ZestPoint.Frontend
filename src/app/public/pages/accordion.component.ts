import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';

export interface AccordionItem {
  question: string;
  answer: string;
}

let nextId = 0;

/** Single-open accordion following the WAI-ARIA disclosure pattern. */
@Component({
  selector: 'zp-accordion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div class="divide-y divide-line-light rounded-2xl border border-line-light bg-white dark:divide-line-dark dark:border-line-dark dark:bg-navy-900/60">
      @for (item of items(); track item.question; let i = $index) {
        <div>
          <h3>
            <button
              type="button"
              [id]="baseId + '-btn-' + i"
              [attr.aria-expanded]="open() === i"
              [attr.aria-controls]="baseId + '-panel-' + i"
              (click)="open.set(open() === i ? null : i)"
              class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-navy-900 dark:text-white"
            >
              {{ item.question }}
              <lucide-icon [img]="ChevronDown" [size]="20" class="shrink-0 text-brand transition-transform dark:text-glow-500" [class.rotate-180]="open() === i" aria-hidden="true" />
            </button>
          </h3>
          <div
            [id]="baseId + '-panel-' + i"
            role="region"
            [attr.aria-labelledby]="baseId + '-btn-' + i"
            [hidden]="open() !== i"
            class="px-5 pb-5 text-slate-700 dark:text-slate-300"
          >{{ item.answer }}</div>
        </div>
      }
    </div>
  `
})
export class AccordionComponent {
  readonly items = input.required<readonly AccordionItem[]>();

  protected readonly baseId = `zp-acc-${nextId++}`;
  protected readonly open = signal<number | null>(0);
  protected readonly ChevronDown = ChevronDown;
}
