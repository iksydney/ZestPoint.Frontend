import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StockGroupDto } from '../../core/models/nav-ops.model';
import { findGroupNameClash, groupNameKey } from '../../core/stock-group-names';
import { ApiError, toApiError } from '../../core/services/api.util';
import { StockGroupApi } from '../../core/services/nav-ops.services';
import { StationsService } from '../../core/services/stations.service';
import { DialogComponent } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

/**
 * A small window that floats over a form (the stock card) so a person who finds no fitting stock group can make one without leaving it.
 * It asks only for the name, the parent group and where the group's items are prepared; everything else takes the defaults of Stock Group
 * Maintenance. Before anything is sent the name is compared with every group the form knows (see `core/stock-group-names.ts`): a name
 * that is the same or looks the same is not sent, and the person is shown the existing group and may use it instead. The server applies
 * the same rule and is the authority, so a refusal it still gives (a group made meanwhile by someone else) is shown in its own words.
 */
@Component({
    selector: 'zp-new-stock-group',
    imports: [DialogComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <zp-dialog [open]="open()" title="New stock group" (closed)="closed.emit()">
      <form class="space-y-3" data-testid="ng-form" autocomplete="off" (submit)="$event.preventDefault(); save()">
        <p class="text-sm text-ink/80">The group is added to your stock groups and chosen for this item. You can choose another afterwards.</p>
        <div>
          <label class="app-label" for="ng-name">Name</label>
          <input id="ng-name" class="app-input" data-testid="ng-name" maxlength="80" [value]="name()" (input)="setName($any($event.target).value)"
                 [attr.aria-invalid]="problem() ? 'true' : null" [attr.aria-describedby]="problem() ? 'ng-name-problem' : null" />
          @if (nameMissing()) { <p id="ng-name-problem" class="app-error" role="alert" data-testid="ng-name-error">{{ name().trim() ? 'Type a name with at least one letter or number.' : 'Type a name.' }}</p> }
          @else if (clash(); as c) {
            <div id="ng-name-problem" class="sys-alert sys-alert-warning mt-2" role="alert" data-testid="ng-clash">
              <p>{{ clashText() }}</p>
              @if (c.group.isActive) {
                <button type="button" class="btn-outline mt-2" data-testid="ng-use-existing" (click)="useExisting(c.group)">Use '{{ c.group.name }}'</button>
              }
            </div>
          }
        </div>
        <zp-search-select label="Parent group" inputId="ng-parent-input" testId="ng-parent" emptyLabel="None (top level)" noun="group" placeholder="Search groups"
                          [options]="parentOptions()" [value]="parentId()" (valueChange)="parentId.set($event || null)" />
        <zp-search-select label="Prepared at" inputId="ng-station-input" testId="ng-station" [emptyLabel]="stationDefault()" noun="station" placeholder="Search stations"
                          [options]="stationOptions()" [value]="stationId()" (valueChange)="stationId.set($event || null)" />
        <p class="text-xs text-ink/70">Where the items of this group are prepared when a bill is sent. Left blank, the group follows its parent group's station. An item can name its own station on its stock card.</p>
        @if (serverError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="ng-error">{{ serverError() }}</p> }
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" data-testid="ng-cancel" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn-primary" data-testid="ng-save" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Create group' }}</button>
        </div>
      </form>
    </zp-dialog>
  `
})
export class NewStockGroupComponent {
  private readonly api = inject(StockGroupApi);
  private readonly stations = inject(StationsService);

  readonly open = input.required<boolean>();
  /** Every group the form knows, switched-off ones too: a similar name is looked for among all of them. */
  readonly groups = input.required<readonly StockGroupDto[]>();
  /** What the person had typed in the group box when they asked for a new one: it becomes the first name. */
  readonly startName = input('');

  /** The group was made on the server. */
  readonly created = output<StockGroupDto>();
  /** The person chose the existing group the typed name clashes with. */
  readonly existingChosen = output<StockGroupDto>();
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly parentId = signal<string | null>(null);
  protected readonly stationId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly clash = computed(() => findGroupNameClash(this.name(), this.groups()));
  /** Shown only once Create was pressed on an empty name: the box is not scolded while the person is still deciding. */
  protected readonly nameMissing = computed(() => this.attempted() && !groupNameKey(this.name()));
  protected readonly problem = computed(() => this.nameMissing() || !!this.clash());
  protected readonly clashText = computed(() => {
    const c = this.clash();
    if (!c) return '';
    const typed = this.name().trim();
    const existing = c.group.name;
    if (c.group.isActive) {
      return c.identical
        ? `A stock group called '${existing}' already exists. Use it, or type a clearly different name.`
        : `'${typed}' looks the same as the existing group '${existing}'. Use that one, or type a clearly different name.`;
    }
    const looks = c.identical ? `A stock group called '${existing}' exists` : `'${typed}' looks the same as the group '${existing}', which exists`;
    return `${looks} but is switched off. A manager can switch it on in Stock Group Maintenance, or you can type a clearly different name.`;
  });

  protected readonly parentOptions = computed<readonly SelectOption[]>(() =>
    this.groups().filter((g) => g.isActive).map((g) => ({ value: g.id, label: g.name, description: g.parentName ? `in ${g.parentName}` : undefined })));
  protected readonly stationOptions = computed<readonly SelectOption[]>(() => this.stations.list().filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })));
  /** A group that names no station follows its parent's: the blank choice says which one when the chosen parent has one, else the company's default. */
  protected readonly stationDefault = computed(() => {
    const viaParent = this.groups().find((g) => g.id === this.parentId())?.effectiveStationName;
    if (viaParent) return `As the parent group says (${viaParent})`;
    const standard = this.stations.list().find((s) => s.isDefault && s.isActive)?.name;
    return standard ? `The default station (${standard})` : 'Nowhere: confirmed when the bill is sent';
  });

  constructor() {
    // Each time the window opens it starts clean, with the name the person had already typed.
    effect(() => {
      if (!this.open()) return;
      const typed = this.startName().trim();
      untracked(() => {
        this.name.set(typed.slice(0, 80));
        this.parentId.set(null);
        this.stationId.set(null);
        this.attempted.set(false);
        this.serverError.set(null);
        this.saving.set(false);
        void this.stations.load();
      });
    });
  }

  protected setName(text: string): void {
    this.name.set(text);
    this.serverError.set(null);
  }

  protected useExisting(group: StockGroupDto): void { this.existingChosen.emit(group); }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.attempted.set(true);
    this.serverError.set(null);
    // A missing, the same or a similar name is never sent: the message under the box says which group it clashes with.
    if (!groupNameKey(this.name()) || this.clash()) { document.getElementById('ng-name')?.focus(); return; }
    this.saving.set(true);
    try {
      const made = await firstValueFrom(this.api.save(null, {
        name: this.name().trim(), code: null, description: null, parentId: this.parentId(), sortOrder: 0, isActive: true,
        stationId: this.stationId(), salesAccountId: null, purchaseAccountId: null
      }));
      this.created.emit(made);
    } catch (err) {
      const e = toApiError(err) as ApiError;
      const words = Object.values(e.fieldErrors).flat();
      this.serverError.set(words.length ? words.join(' ') : e.message);
    } finally { this.saving.set(false); }
  }
}
