import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { navFor } from '../../core/navigation/app-nav';
import { ReportDefinition } from '../../core/navigation/report-definitions';
import { ReportViewComponent } from './report-view.component';

/** A route screen for one report: the navigation entry supplies the title and the report definition, the shared view does the rest. */
@Component({
    selector: 'zp-report-page',
    imports: [ReportViewComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<zp-report-view [definition]="definition" [title]="title" [description]="description()" (loaded)="description.set($event.description)" />`
})
export class ReportPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly definition = this.route.snapshot.data['report'] as ReportDefinition;
  protected readonly title = navFor(this.router.url)?.label ?? 'Report';
  protected readonly description = signal(navFor(this.router.url)?.description ?? '');
}

