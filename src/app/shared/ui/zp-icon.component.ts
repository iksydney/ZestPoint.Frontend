import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICON_PATHS, IconName } from './icon-paths';

/** A small inline SVG icon that takes its colour from the surrounding text (currentColor), so it follows the venue's theme. */
@Component({
  selector: 'zp-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg [style.width.px]="size()" [style.height.px]="size()" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="path()" /></svg>`,
  styles: [':host { display: inline-flex; flex-shrink: 0; line-height: 0; }']
})
export class ZpIconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
