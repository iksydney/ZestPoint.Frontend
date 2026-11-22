import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, input, output, signal, viewChild } from '@angular/core';

export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly group?: string;
}

interface Placement {
  readonly left: number;
  readonly width: number;
  readonly top: number | null;
  readonly bottom: number | null;
  readonly maxHeight: number;
}

/** Lower case with the accents taken off, so "cafe" finds "Cafe with an accent" and capitals never matter. */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/**
 * Searchable dropdown following the ARIA 1.2 combobox pattern: click or press Down to open, type to filter, Up/Down to move, Enter to
 * choose, Escape to close (only the list closes: a dialog or card around it stays). It replaces the native select wherever the list comes
 * from the company's own data and can grow (items, suppliers, groups, bins, staff, branches...), so nobody scrolls a long list.
 *
 * - Every word typed must appear in an entry's name, description or group, in any order and any letter case; an exact name is listed
 *   first, then names that start with the words.
 * - `emptyLabel` adds a first entry that means "nothing chosen" (No group, All branches, Choose...). It reports the value '' so a
 *   parent can turn it into null with `$event || null`, and it is what the box shows while nothing is chosen.
 * - `createLabel` adds a LAST entry that asks the parent to make a new one (`createRequested`, with what was typed). It is always
 *   offered, also when nothing matches, and `noun` words the "nothing found" line ("No group called 'xyz'.").
 * - The list is placed with `position: fixed` under (or, near the foot of the screen, above) the box, so a dialog, a scrolling card or a
 *   table cell never clips it. A click on it is not passed on to an enclosing `<label>` (which would click the box and open the list again),
 *   though a `<label>` around the box also puts the open list into the box's accessible name: prefer `<label for>` and `inputId`.
 * - The label is optional: put a `<label for>` beside it and give `inputId`, or give `ariaLabel` (a table cell). `testId` is on the
 *   input a test types into; the list is `<testId>-list`, an entry has `data-value`, the create entry is `<testId>-create`.
 */
@Component({
    selector: 'zp-search-select',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
    <div class="relative">
      @if (label()) { <label class="app-label" [attr.for]="inputElementId()">{{ label() }}</label> }
      <div class="relative">
        <input
          #field
          [id]="inputElementId()" type="text" role="combobox" autocomplete="off" spellcheck="false" [class]="inputClass() + ' pr-8 disabled:opacity-60'"
          aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-controls]="open() ? listId() : null" aria-autocomplete="list"
          [attr.aria-label]="label() ? null : ariaLabel()"
          [attr.aria-activedescendant]="open() && active() >= 0 ? optionId(active()) : null"
          [attr.aria-invalid]="invalid() ? 'true' : null" [attr.aria-describedby]="invalid() ? inputElementId() + '-err' : null"
          [placeholder]="open() && selectedLabel() ? selectedLabel() : placeholder()" [value]="open() ? query() : shown()" [disabled]="disabled()"
          (input)="onType($any($event.target).value)" (click)="openList()" (blur)="onBlur()" (keydown)="onKey($event)"
          [attr.data-testid]="testId()"
        />
        <svg class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/60" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.5 7.5 10 12.5l4.5-5z" /></svg>
      </div>
      @if (placement(); as p) {
        <ul #list [id]="listId()" role="listbox" [attr.aria-label]="label() || ariaLabel()" [attr.data-testid]="testId() + '-list'"
            class="fixed z-[70] overflow-auto rounded-lg border border-ink/20 bg-panel p-1 text-left shadow-lg"
            [style.left.px]="p.left" [style.width.px]="p.width" [style.top.px]="p.top" [style.bottom.px]="p.bottom" [style.max-height.px]="p.maxHeight"
            (mousedown)="$event.preventDefault()" (click)="$event.preventDefault()">
          @for (o of filtered(); track o.value; let i = $index) {
            @if (showGroup(i)) { <li role="presentation" class="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink/60">{{ o.group }}</li> }
            <li [id]="optionId(i)" role="option" [attr.aria-selected]="o.value === current()" [attr.data-value]="o.value" [attr.data-active]="i === active()"
                class="flex cursor-pointer flex-col justify-center rounded-md px-2 py-2 text-sm [@media(pointer:coarse)]:min-h-11" [class]="i === active() ? 'bg-primary text-on-primary' : 'text-ink hover:bg-ink/10'"
                (mousedown)="$event.preventDefault(); choose(o)" (mouseenter)="active.set(i)">
              <span class="font-medium">{{ o.label }}</span>
              @if (o.description) { <span class="block text-xs" [class]="i === active() ? 'text-on-primary/80' : 'text-ink/70'">{{ o.description }}</span> }
            </li>
          } @empty {
            <li class="px-2 py-3 text-sm text-ink/70" role="presentation" [attr.data-testid]="testId() + '-none'">{{ noneText() }}</li>
          }
          @if (createLabel(); as create) {
            <li [id]="optionId(filtered().length)" role="option" aria-selected="false" [attr.data-active]="active() === filtered().length" [attr.data-testid]="testId() + '-create'"
                class="mt-1 flex cursor-pointer flex-col justify-center rounded-md border-t border-ink/10 px-2 py-2 text-sm font-semibold [@media(pointer:coarse)]:min-h-11" [class]="active() === filtered().length ? 'bg-primary text-on-primary' : 'text-ink hover:bg-ink/10'"
                (mousedown)="$event.preventDefault(); requestCreate()" (mouseenter)="active.set(filtered().length)">{{ create }}</li>
          }
        </ul>
      }
      @if (invalid() && error()) { <p class="app-error" [id]="inputElementId() + '-err'" role="alert">{{ error() }}</p> }
    </div>
  `
})
export class SearchSelectComponent<T extends string = string> implements OnDestroy {
  private static next = 0;
  private readonly autoId = `zp-ss-${SearchSelectComponent.next++}`;

  /** Visible label above the box. Leave empty when a `<label for>` elsewhere points at `inputId`, or when `ariaLabel` names it. */
  readonly label = input('');
  readonly ariaLabel = input<string | null>(null);
  /** The id of the input, for a `<label for>` outside this component. */
  readonly inputId = input<string | null>(null);
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly value = input<T | '' | null | undefined>(null);
  readonly placeholder = input('Search...');
  readonly testId = input('search-select');
  readonly error = input<string | null>(null);
  /** First entry meaning "nothing chosen"; it reports '' and is what the box shows while the value is empty. */
  readonly emptyLabel = input<string | null>(null);
  readonly disabled = input(false);
  /** Classes of the input itself (the compact bars of the purchase order use their own). */
  readonly inputClass = input('app-input');
  /** Text of a last entry that asks for a new record to be made (`createRequested`); empty = no such entry. */
  readonly createLabel = input<string | null>(null);
  /** What the entries are ("group"): words the line shown when nothing matches. */
  readonly noun = input<string | null>(null);

  readonly valueChange = output<T>();
  /** Fires when focus leaves the control, so a parent can start showing its validation message. */
  readonly blurred = output<void>();
  /** The last entry was chosen. Carries what had been typed in the box (the parent may use it as a first name). */
  readonly createRequested = output<string>();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly placement = signal<Placement | null>(null);

  protected readonly inputElementId = computed(() => this.inputId() ?? this.autoId);
  protected readonly listId = computed(() => `${this.inputElementId()}-list`);
  protected readonly invalid = computed(() => !!this.error());
  protected readonly current = computed<string>(() => this.value() ?? '');
  protected readonly allOptions = computed<readonly SelectOption<T>[]>(() => {
    const empty = this.emptyLabel();
    return empty === null ? this.options() : [{ value: '' as T, label: empty }, ...this.options()];
  });
  protected readonly selectedLabel = computed(() => this.allOptions().find((o) => o.value === this.current())?.label ?? '');
  /** What the closed box shows. */
  protected readonly shown = computed(() => this.selectedLabel());
  protected readonly filtered = computed<readonly SelectOption<T>[]>(() => {
    const terms = fold(this.query()).split(/\s+/).filter(Boolean);
    const all = this.allOptions();
    if (terms.length === 0) return all;
    const phrase = terms.join(' ');
    const rank = (o: SelectOption<T>): number => { const l = fold(o.label); return l === phrase ? 0 : l.startsWith(phrase) ? 1 : 2; };
    return all
      .map((o, index) => ({ o, index }))
      .filter(({ o }) => { const hay = fold(`${o.label} ${o.description ?? ''} ${o.group ?? ''}`); return terms.every((t) => hay.includes(t)); })
      .sort((a, b) => rank(a.o) - rank(b.o) || a.index - b.index)
      .map(({ o }) => o);
  });
  protected readonly noneText = computed(() => {
    const noun = this.noun();
    const typed = this.query().trim();
    if (!noun) return 'No matches';
    return typed ? `No ${noun} called '${typed}'.` : `No ${noun} yet.`;
  });

  private readonly onViewMoved = (event: Event): void => {
    if (event.type === 'scroll' && event.target instanceof Node && this.list()?.nativeElement.contains(event.target)) return;
    this.place();
  };

  protected optionId(index: number): string { return `${this.inputElementId()}-opt-${index}`; }

  protected showGroup(index: number): boolean {
    const list = this.filtered();
    return !!list[index]?.group && (index === 0 || list[index - 1]?.group !== list[index]?.group);
  }

  private rowCount(): number { return this.filtered().length + (this.createLabel() ? 1 : 0); }

  protected openList(): void {
    if (this.disabled() || this.open()) return;
    this.query.set('');
    this.active.set(Math.max(0, this.filtered().findIndex((o) => o.value === this.current())));
    this.show();
  }

  private show(): void {
    this.open.set(true);
    this.place();
    document.addEventListener('scroll', this.onViewMoved, true);
    window.addEventListener('resize', this.onViewMoved);
    this.reveal();
  }

  private close(): void {
    this.open.set(false);
    this.placement.set(null);
    document.removeEventListener('scroll', this.onViewMoved, true);
    window.removeEventListener('resize', this.onViewMoved);
  }

  ngOnDestroy(): void { this.close(); }

  /** The list sits under the box, or above it when the room below is short, and never taller than the room it has. */
  private place(): void {
    const el = this.field()?.nativeElement;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    const below = viewport - box.bottom - 8;
    const above = box.top - 8;
    const up = below < 200 && above > below;
    this.placement.set({
      left: box.left, width: box.width, top: up ? null : box.bottom + 4, bottom: up ? window.innerHeight - box.top + 4 : null,
      maxHeight: Math.max(120, Math.min(288, up ? above : below))
    });
  }

  /** Keeps the entry the keyboard is on inside the visible part of the list. */
  private reveal(): void {
    setTimeout(() => {
      const ul = this.list()?.nativeElement;
      const li = ul?.querySelector<HTMLElement>('[data-active="true"]');
      if (!ul || !li) return;
      if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
    });
  }

  protected onType(text: string): void {
    this.query.set(text);
    this.active.set(0);
    if (this.disabled()) return;
    if (!this.open()) this.show(); else this.place();
    this.reveal();
  }

  protected onBlur(): void {
    this.close();
    this.blurred.emit();
  }

  protected choose(option: SelectOption<T>): void {
    this.valueChange.emit(option.value);
    this.close();
  }

  protected requestCreate(): void {
    const typed = this.query().trim();
    this.close();
    this.createRequested.emit(typed);
  }

  private move(to: number): void {
    this.active.set(Math.max(0, Math.min(this.rowCount() - 1, to)));
    this.reveal();
  }

  protected onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) this.openList(); else this.move(this.active() + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) this.openList(); else this.move(this.active() - 1);
        break;
      case 'Enter': {
        if (!this.open()) break;
        const list = this.filtered();
        const index = this.active();
        if (list[index]) { event.preventDefault(); this.choose(list[index]!); }
        else if (this.createLabel() && index === list.length) { event.preventDefault(); this.requestCreate(); }
        else if (this.query().trim()) event.preventDefault(); // searching with nothing found: Enter must not send the form off
        break;
      }
      case 'Escape':
        if (this.open()) {
          // Only the list closes: a dialog or the stock card around it listens for Escape on the document.
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
    }
  }
}
