import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isHex, normalizeHex } from '../../core/theme/color';

/**
 * Colour control: native colour picker + hexadecimal input + reset. Only a VALID #RRGGBB value is ever emitted, so the
 * rest of the editor (and the live preview) never sees a half-typed colour.
 */
@Component({
  selector: 'zp-color-field',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <label class="app-label" [attr.for]="id">{{ label() }}@if (optional()) { <span class="font-normal text-ink/60"> (optional)</span> }</label>
      <div class="flex items-center gap-2">
        <input type="color" class="h-10 w-12 shrink-0 cursor-pointer rounded border border-ink/25 bg-transparent p-0.5" [attr.aria-label]="label() + ' picker'"
               [value]="pickerValue()" (input)="onPicker($any($event.target).value)" [attr.data-testid]="'picker-' + testId()" />
        <input [id]="id" class="app-input font-mono uppercase" maxlength="7" spellcheck="false" autocomplete="off"
               [ngModel]="text()" (ngModelChange)="onText($event)" [attr.aria-invalid]="invalid()"
               [attr.aria-describedby]="invalid() ? id + '-err' : null" [attr.data-testid]="'hex-' + testId()"
               [placeholder]="optional() ? 'Automatic' : '#RRGGBB'" />
        @if (resettable()) {
          <button type="button" class="btn-ghost shrink-0 px-2 text-xs" (click)="reset.emit()" [attr.aria-label]="'Reset ' + label()">Reset</button>
        }
      </div>
      @if (invalid()) { <p class="app-error" [id]="id + '-err'" role="alert">Enter a colour like #1D4ED8.</p> }
    </div>
  `
})
export class ColorFieldComponent {
  private static next = 0;
  protected readonly id = `zp-color-${ColorFieldComponent.next++}`;

  readonly label = input.required<string>();
  readonly testId = input.required<string>();
  readonly value = input<string | null>(null);
  readonly optional = input(false);
  readonly resettable = input(true);

  readonly valueChange = output<string | null>();
  readonly reset = output<void>();

  private readonly typed = signal<string | null>(null);
  protected readonly text = computed(() => this.typed() ?? this.value() ?? '');
  protected readonly invalid = computed(() => {
    const t = this.typed();
    return t !== null && t !== '' && !isHex(normalizeHex(t));
  });
  protected readonly pickerValue = computed(() => (isHex(this.value()) ? this.value()!.toLowerCase() : '#000000'));

  protected onPicker(value: string): void {
    this.typed.set(null);
    this.valueChange.emit(value.toUpperCase());
  }

  protected onText(raw: string): void {
    this.typed.set(raw);
    if (raw.trim() === '' && this.optional()) {
      this.typed.set(null);
      this.valueChange.emit(null);
      return;
    }
    const hex = normalizeHex(raw);
    if (isHex(hex)) {
      this.typed.set(null);
      this.valueChange.emit(hex);
    }
  }
}
