import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { landingGuard } from './core/guards/landing.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';
import { platformGuard, platformPermissionGuard } from './core/guards/platform.guard';
import { PLATFORM_PERMISSIONS } from './core/models/support.model';
import { workspaceLockGuard } from './core/guards/workspace-lock.guard';
import { screenRbacGuard } from './core/guards/screen-rbac.guard';
import { subscriptionGateGuard } from './core/guards/subscription-gate.guard';
import { FEATURES, RouteAccessData, SCREEN_PERMISSIONS, ScreenPermission } from './core/models/rbac.model';
import { APP_NAV, permissionsOf } from './core/navigation/app-nav';

/**
 * Every screen that carries a lazy loader in the navigation list (POS, Stock and Purchasing screens and their reports) is routed from that
 * ONE list, with the permission and module read from the same definition the menu uses. A screen can therefore not be shown in the menu
 * and routed or protected differently. Guards order: permission, then subscription module.
 */
/** The purchasing documents are opened from the list and from the receiving queue; they are not menu entries of their own. */
const purchasingDocumentRoutes: Routes = [
  { path: 'purchasing/orders/:id/receive', title: 'Receive goods', canActivate: [screenRbacGuard, subscriptionGateGuard], data: { permission: [SCREEN_PERMISSIONS.PURCHASING_RECEIVE], feature: FEATURES.INVENTORY, screen: 'purchasing.receiving' } satisfies RouteAccessData,
    loadComponent: () => import('./features/purchasing/goods-receiving.component').then((m) => m.GoodsReceivingComponent) },
  { path: 'purchasing/orders/:id', title: 'Purchasing document' /* the id 'new' starts a document; the same route serves it once saved, so the screen is not rebuilt mid-save */, canActivate: [screenRbacGuard, subscriptionGateGuard], data: { permission: [SCREEN_PERMISSIONS.INVENTORY_PURCHASE_MANAGE], feature: FEATURES.INVENTORY, screen: 'purchasing.orders' } satisfies RouteAccessData,
    loadComponent: () => import('./features/purchasing/purchase-order-workstation.component').then((m) => m.PurchaseOrderWorkstationComponent) },
  { path: 'purchasing/receipts/:id', title: 'Goods received note', canActivate: [screenRbacGuard, subscriptionGateGuard], data: { permission: [SCREEN_PERMISSIONS.PURCHASING_RECEIVE], feature: FEATURES.INVENTORY, screen: 'purchasing.receiving' } satisfies RouteAccessData,
    loadComponent: () => import('./features/purchasing/goods-receipt-view.component').then((m) => m.GoodsReceiptViewComponent) }
];

const navRoutes: Routes = APP_NAV.filter((n) => n.load).map((n) => ({
  path: n.route.replace(/^\/app\//, ''),
  title: n.label,
  canActivate: [screenRbacGuard, subscriptionGateGuard],
  data: { permission: permissionsOf(n) as readonly ScreenPermission[], feature: n.feature, screen: n.feature ? n.key : undefined, report: n.data?.report } satisfies RouteAccessData & { report?: unknown },
  loadComponent: n.load!
}));

/**
 * Guard order: authGuard (who) -> screenRbacGuard (may they) -> subscriptionGateGuard (did the tenant pay).
 * `data` is typed through RouteAccessData so permission/feature codes can not be misspelled. These guards only shape the UI;
 * the API independently enforces the same rules on every request.
 */
export const routes: Routes = [
  // ---- Public marketing site (same app, same port) -------------------------
  {
    path: '',
    loadComponent: () => import('./public/layout/public-layout.component').then((m) => m.PublicLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'ZestPoint | Enterprise POS for Hospitality & Retail',
        loadComponent: () => import('./public/pages/home.page').then((m) => m.HomePageComponent)
      },
      {
        path: 'features',
        title: 'Features | ZestPoint',
        loadComponent: () => import('./public/pages/features.page').then((m) => m.FeaturesPageComponent)
      },
      {
        path: 'pricing',
        title: 'Pricing | ZestPoint',
        loadComponent: () => import('./public/pages/pricing.page').then((m) => m.PricingPageComponent)
      },
      {
        path: 'contact',
        title: 'Contact & Demo Request | ZestPoint',
        loadComponent: () => import('./public/pages/contact.page').then((m) => m.ContactPageComponent)
      },
      {
        path: 'privacy',
        title: 'Privacy Policy | ZestPoint',
        loadComponent: () => import('./public/legal/privacy.page').then((m) => m.PrivacyPageComponent)
      },
      {
        path: 'terms',
        title: 'Terms of Service | ZestPoint',
        loadComponent: () => import('./public/legal/terms.page').then((m) => m.TermsPageComponent)
      }
    ]
  },

  // ---- Registration & sign-in ----------------------------------------------
  {
    path: 'register',
    title: 'Register | ZestPoint',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/registration/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'login',
    title: 'Sign in | ZestPoint',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/system/login.component').then((m) => m.LoginComponent)
  },

  {
    path: 'accept-invite',
    title: 'Accept invitation | ZestPoint',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/system/accept-invite.component').then((m) => m.AcceptInviteComponent)
  },

  // ---- First-run setup (company administrators) ------------------------------
  {
    path: 'onboarding',
    title: 'Set up | ZestPoint',
    canActivate: [authGuard, screenRbacGuard],
    data: { permission: SCREEN_PERMISSIONS.SETTINGS_COMPANY_MANAGE } satisfies RouteAccessData,
    loadComponent: () => import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent)
  },

  // ---- The signed-in application ---------------------------------------------
  {
    path: 'app',
    canActivate: [authGuard],
    canActivateChild: [workspaceLockGuard],
    loadComponent: () => import('./features/shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', canActivate: [landingGuard], children: [] },
      // The reports of one area on one page. It lists only what the person may open; each report's own route and API stay guarded.
      { path: 'reports/:area', title: 'Reports', loadComponent: () => import('./features/reports/report-hub.component').then((m) => m.ReportHubComponent) },
      // The set-up screens of one area on one page (Branches, Tables, Settings, Branding ...), listed the same way.
      { path: 'setup/:area', title: 'Set-up', data: { hub: 'setup' }, loadComponent: () => import('./features/reports/report-hub.component').then((m) => m.ReportHubComponent) },
      {
        path: 'dashboard',
        title: 'Dashboard',
        canActivate: [onboardingGuard, screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.DASHBOARD_VIEW } satisfies RouteAccessData,
        loadComponent: () => import('./features/shell/dashboard.component').then((m) => m.DashboardComponent)
      },
      ...purchasingDocumentRoutes,
      ...navRoutes,
      {
        path: 'inventory',
        title: 'Inventory',
        canActivate: [screenRbacGuard, subscriptionGateGuard],
        data: { permission: SCREEN_PERMISSIONS.INVENTORY_VIEW, feature: FEATURES.INVENTORY, screen: 'inventory' } satisfies RouteAccessData,
        loadComponent: () => import('./features/inventory/inventory.component').then((m) => m.InventoryComponent)
      },
      {
        path: 'subscription',
        title: 'Subscription',
        canActivate: [screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.SUBSCRIPTIONS_VIEW } satisfies RouteAccessData,
        loadComponent: () => import('./features/subscription/subscription.component').then((m) => m.SubscriptionComponent)
      },
      {
        path: 'support',
        title: 'Support',
        canActivate: [screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.SUPPORT_VIEW } satisfies RouteAccessData,
        loadComponent: () => import('./features/support/support.component').then((m) => m.SupportComponent)
      },
      {
        path: 'settings/operations',
        title: 'Operations settings',
        canActivate: [screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.SETTINGS_COMPANY_MANAGE } satisfies RouteAccessData,
        loadComponent: () => import('./features/settings/operations-settings.component').then((m) => m.OperationsSettingsComponent)
      },
      {
        path: 'staff',
        title: 'Staff',
        canActivate: [screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.STAFF_VIEW } satisfies RouteAccessData,
        loadComponent: () => import('./features/staff-rbac/staff-rbac.component').then((m) => m.StaffRbacComponent)
      },
      {
        path: 'settings/branches',
        title: 'Branches',
        canActivate: [screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.BRANCHES_MANAGE } satisfies RouteAccessData,
        loadComponent: () => import('./features/staff-rbac/branches.component').then((m) => m.BranchesComponent)
      },
      {
        path: 'settings/branding',
        title: 'Branding & Appearance',
        canActivate: [screenRbacGuard],
        data: { permission: SCREEN_PERMISSIONS.SETTINGS_BRANDING_VIEW } satisfies RouteAccessData,
        loadComponent: () => import('./features/branding/branding-settings.component').then((m) => m.BrandingSettingsComponent)
      }
    ]
  },

  // ---- System pages ------------------------------------------------------------
  {
    path: 'forbidden',
    loadComponent: () => import('./features/system/system-pages.component').then((m) => m.ForbiddenComponent)
  },
  {
    path: 'restricted',
    loadComponent: () => import('./features/system/system-pages.component').then((m) => m.RestrictedComponent)
  },

  // ---- Platform administration: the operator who runs ZestPoint itself (a separate sign-in from any company) ----
  {
    path: 'platform/login',
    title: 'Platform sign in | ZestPoint',
    loadComponent: () => import('./features/platform/platform-login.component').then((m) => m.PlatformLoginComponent)
  },
  {
    path: 'platform',
    canActivate: [platformGuard],
    loadComponent: () => import('./features/platform/platform-shell.component').then((m) => m.PlatformShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', title: 'Platform overview', loadComponent: () => import('./features/platform/platform-overview.component').then((m) => m.PlatformOverviewComponent) },
      { path: 'tenants', title: 'Companies', loadComponent: () => import('./features/platform/platform-tenants.component').then((m) => m.PlatformTenantsComponent) },
      { path: 'tenants/:id', title: 'Company', loadComponent: () => import('./features/platform/platform-tenant-detail.component').then((m) => m.PlatformTenantDetailComponent) },
      { path: 'plans', title: 'Plans', loadComponent: () => import('./features/platform/platform-plans.component').then((m) => m.PlatformPlansComponent) },
      { path: 'support', title: 'Support tickets', canActivate: [platformPermissionGuard], data: { platformPermission: PLATFORM_PERMISSIONS.TICKETS_VIEW },
        loadComponent: () => import('./features/platform/platform-support.component').then((m) => m.PlatformSupportComponent) },
      { path: 'support/:id', title: 'Ticket', canActivate: [platformPermissionGuard], data: { platformPermission: PLATFORM_PERMISSIONS.TICKETS_VIEW },
        loadComponent: () => import('./features/platform/platform-ticket.component').then((m) => m.PlatformTicketComponent) },
      { path: 'customers', title: 'Customers', canActivate: [platformPermissionGuard], data: { platformPermission: PLATFORM_PERMISSIONS.CRM_VIEW },
        loadComponent: () => import('./features/platform/platform-customers.component').then((m) => m.PlatformCustomersComponent) },
      { path: 'customers/:id', title: 'Customer', canActivate: [platformPermissionGuard], data: { platformPermission: PLATFORM_PERMISSIONS.CRM_VIEW },
        loadComponent: () => import('./features/platform/platform-customer.component').then((m) => m.PlatformCustomerComponent) },
      { path: 'users', title: 'People', canActivate: [platformPermissionGuard], data: { platformPermission: PLATFORM_PERMISSIONS.USERS_VIEW },
        loadComponent: () => import('./features/platform/platform-users.component').then((m) => m.PlatformUsersComponent) },
      { path: 'operators', title: 'Operators', canActivate: [platformPermissionGuard], data: { platformPermission: PLATFORM_PERMISSIONS.OPERATORS_MANAGE },
        loadComponent: () => import('./features/platform/platform-operators.component').then((m) => m.PlatformOperatorsComponent) }
    ]
  },
  {
    path: 'upgrade',
    loadComponent: () => import('./features/system/system-pages.component').then((m) => m.UpgradeRequiredComponent)
  },
  // A customer's receipt, opened from its web link without signing in.
  { path: 'r/:token', title: 'Your receipt', loadComponent: () => import('./features/receipt/public-receipt.page').then((m) => m.PublicReceiptPageComponent) },
  // A customer at a table, opened from the QR code on it, without signing in: the table's code is the only key.
  { path: 't/:code', title: 'Order from your table', loadComponent: () => import('./features/table-order/public-table.page').then((m) => m.PublicTablePageComponent) },
  // The holder of a gift card checking what is left, without signing in: the code is the only key.
  { path: 'gift-card', title: 'Check your gift card', loadComponent: () => import('./features/gift-card/public-gift-card.page').then((m) => m.PublicGiftCardPageComponent) },
  // A purchase order, opened by its supplier from the link they were sent, without signing in.
  { path: 'po/:token', title: 'Purchase order', loadComponent: () => import('./features/purchasing/public-purchase-order.page').then((m) => m.PublicPurchaseOrderPageComponent) },
  { path: '**', redirectTo: '' }
];
