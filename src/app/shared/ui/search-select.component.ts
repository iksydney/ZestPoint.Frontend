import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly group?: string;
}

/**
 * Searchable dropdown following the ARIA 1.2 combobox pattern: type to filter, Up/Down to move, Enter to choose,
 * Escape to close. Options may be grouped. The selected value is shown in the input when closed.
 */
@Component({
  selector: 'zp-search-select',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <label class="app-label" [attr.for]="id">{{ label() }}</label>
      <input
        [id]="id" type="text" role="combobox" autocomplete="off" class="app-input"
        [attr.aria-expanded]="open()" [attr.aria-controls]="id + '-list'" aria-autocomplete="list"
        [attr.aria-activedescendant]="open() && active() >= 0 ? id + '-opt-' + active() : null"
        [attr.aria-invalid]="invalid()" [attr.aria-describedby]="invalid() ? id + '-err' : null"
        [placeholder]="placeholder()" [ngModel]="open() ? query() : selectedLabel()"
        (ngModelChange)="onType($event)" (focus)="openList()" (blur)="onBlur()" (keydown)="onKey($event)"
        [attr.data-testid]="testId()"
      />
      @if (open()) {
        <ul [id]="id + '-list'" role="listbox" class="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink/20 bg-panel p-1 shadow-lg">
          @for (o of filtered(); track o.value; let i = $index) {
            @if (showGroup(i)) { <li role="presentation" class="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink/60">{{ o.group }}</li> }
            <li [id]="id + '-opt-' + i" role="option" [attr.aria-selected]="o.value === value()"
                class="cursor-pointer rounded-md px-2 py-2 text-sm text-ink" [class]="i === active() ? 'bg-primary text-on-primary' : 'hover:bg-ink/10'"
                (mousedown)="$event.preventDefault(); choose(o)" (mouseenter)="active.set(i)">
              <span class="font-medium">{{ o.label }}</span>
              @if (o.description) { <span class="block text-xs" [class]="i === active() ? 'text-on-primary/80' : 'text-ink/70'">{{ o.description }}</span> }
            </li>
          } @empty {
            <li class="px-2 py-3 text-sm text-ink/70" role="presentation">No matches</li>
          }
        </ul>
      }
      @if (invalid() && error()) { <p class="app-error" [id]="id + '-err'" role="alert">{{ error() }}</p> }
    </div>
  `
})
export class SearchSelectComponent<T extends string = string> {
  private static next = 0;
  protected readonly id = `zp-ss-${SearchSelectComponent.next++}`;

  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly value = input<T | null>(null);
  readonly placeholder = input('Search...');
  readonly testId = input('search-select');
  readonly error = input<string | null>(null);

  readonly valueChange = output<T>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  protected readonly invalid = computed(() => !!this.error());
  protected readonly selectedLabel = computed(() => this.options().find((o) => o.value === this.value())?.label ?? '');
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q
      ? this.options().filter((o) => `${o.label} ${o.description ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q))
      : this.options();
  });

  protected showGroup(index: number): boolean {
    const list = this.filtered();
    return !!list[index]?.group && (index === 0 || list[index - 1]?.group !== list[index]?.group);
  }

  protected openList(): void {
    this.query.set('');
    const idx = this.filtered().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(0, idx));
    this.open.set(true);
  }

  protected onType(text: string): void {
    this.query.set(text);
    this.active.set(0);
    this.open.set(true);
  }

  protected onBlur(): void {
    this.open.set(false);
  }

  protected choose(option: SelectOption<T>): void {
    this.valueChange.emit(option.value);
    this.open.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    const list = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) this.openList();
        else this.active.set(Math.min(list.length - 1, this.active() + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(Math.max(0, this.active() - 1));
        break;
      case 'Enter':
        if (this.open() && list[this.active()]) {
          event.preventDefault();
          this.choose(list[this.active()]!);
        }
        break;
      case 'Escape':
        this.open.set(false);
        break;
    }
  }
}
