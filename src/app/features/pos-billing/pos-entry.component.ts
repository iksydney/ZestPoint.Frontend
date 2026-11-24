import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShiftPromptService } from '../../core/services/shift-prompt.service';
import { ShiftGateComponent } from '../../shared/ui/shift-gate.component';
import { PosBillingComponent } from './pos-billing.component';

/**
 * The route of the Point of Sale (`/app/pos`). A person who sells or takes orders and has no shift running is shown the Start your shift
 * box instead of the till (owner's rule, 2026-11-24); when the shift starts the till takes its place, with no reload. The till is not built
 * until then, so none of its reading or loading happens in front of the gate. The other screens under `/app/pos/...` are not selling screens
 * and have no gate. This only shapes the screen: the server decides what it accepts.
 */
@Component({
  selector: 'zp-pos-entry',
  imports: [PosBillingComponent, ShiftGateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prompt.gate() === 'open') { <zp-pos-billing /> } @else { <zp-shift-gate /> }
  `
})
export class PosEntryComponent {
  protected readonly prompt = inject(ShiftPromptService);
}
