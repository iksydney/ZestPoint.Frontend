import { Injectable, computed, inject } from '@angular/core';
import { AccessService } from '../services/access.service';
import { AuthService } from '../services/auth.service';
import { BarStore } from '../services/bar.services';
import { APP_NAV, NavDefinition, permissionsOf } from './app-nav';
import { NAV_AREAS, NAV_HOME, NavArea, NavAreaKey, areaOf, isReport } from './nav-layout';

/** One area of the menu as this person sees it: the working screens they may use, and the reports behind its Reports page. */
export interface NavSection {
  readonly area: NavArea;
  readonly screens: readonly NavDefinition[];
  /** The set-up screens behind the area's Set-up page. */
  readonly setup: readonly NavDefinition[];
  readonly reports: readonly NavDefinition[];
}

/**
 * The screens this person may use, laid out as the menu shows them. The menu, the search box, the Reports pages, the breadcrumb and the
 * tour all read this one list, so nothing is offered in one place and missing in another. Hiding an entry is a convenience only: every
 * route and every API call is guarded independently.
 */
@Injectable({ providedIn: 'root' })
export class NavService {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly bar = inject(BarStore);

  /** Permission AND module AND the screen itself (an operator may withhold just one); a locked workspace keeps only subscription and support. */
  readonly items = computed<readonly NavDefinition[]>(() =>
    APP_NAV.filter((n) => this.auth.hasAnyPermission(permissionsOf(n)) && (!this.auth.locked() || n.key === 'subscription' || n.key === 'support')
      && this.access.canShow(n) && (n.key !== 'pos.bar' || this.bar.enabled())));

  readonly home = computed<NavDefinition | null>(() => this.items().find((n) => n.key === NAV_HOME) ?? null);

  readonly sections = computed<readonly NavSection[]>(() => {
    const mine = this.items();
    return NAV_AREAS.map((area) => ({
      area,
      screens: area.screens.map((key) => mine.find((n) => n.key === key)).filter((n): n is NavDefinition => !!n),
      setup: (area.setup ?? []).map((key) => mine.find((n) => n.key === key)).filter((n): n is NavDefinition => !!n),
      reports: mine.filter((n) => isReport(n) && areaOf(n) === area.key)
    })).filter((s) => s.screens.length > 0 || s.setup.length > 0 || s.reports.length > 0);
  });

  section = (key: NavAreaKey | string | null | undefined): NavSection | null => this.sections().find((s) => s.area.key === key) ?? null;
  has = (navKey: string): boolean => this.items().some((n) => n.key === navKey);
}
