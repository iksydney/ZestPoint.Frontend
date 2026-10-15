/** Bins, the purchase-order workstation and goods receiving (ZestPoint.Data/ViewModel/PurchasingModels.cs). Enums travel as their string names. */

import type { PurchaseOrderStatus, StockUnit, SupplierDto } from './ops.model';
import type { PagedResult } from './staff.model';

export type { PagedResult };

export type PurchaseDocumentType = 'Standard' | 'DirectConsignment' | 'VendorReturn' | 'StockTransfer';
export type ReceiptStatus = 'Posted' | 'AwaitingSecondKey' | 'SecondKeyRejected';
export type DiscrepancyKind = 'Shortage' | 'Damage' | 'WrongItem' | 'Other';

export const DOCUMENT_TYPES: readonly { value: PurchaseDocumentType; label: string; short: string }[] = [
  { value: 'Standard', label: 'Standard Inward Purchase Order', short: 'Purchase order' },
  { value: 'DirectConsignment', label: 'Direct Consignment In', short: 'Direct consignment' },
  { value: 'VendorReturn', label: 'Credit Vendor Return', short: 'Vendor return' },
  { value: 'StockTransfer', label: 'Inter-Cellar Stock Transfer', short: 'Stock transfer' }
];

export const STATUS_TEXT: Readonly<Record<PurchaseOrderStatus, string>> = {
  Draft: 'Draft - unposted', Submitted: 'Posted - awaiting approval', Approved: 'Approved - awaiting receiving', PartiallyReceived: 'Awaiting verification / partial', Received: 'Received', Cancelled: 'Cancelled'
};

export interface BinDto { id: string; branchId: string; code: string; name: string; isHighSecurity: boolean; isActive: boolean; sortOrder: number; itemCount: number; rowVersion: string }
export interface SaveBinRequest { branchId: string; code: string; name: string; isHighSecurity: boolean; isActive: boolean; sortOrder: number; rowVersion?: string | null }

export interface BinStockRowDto {
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  unit: StockUnit;
  /** Null for the unassigned remainder. */
  binId: string | null;
  binCode: string;
  binName: string;
  isHighSecurity: boolean;
  quantity: number;
}

export interface MoveBetweenBinsRequest { branchId: string; inventoryItemId: string; fromBinId: string | null; toBinId: string | null; quantity: number; reason: string | null; idempotencyKey: string }
export interface ItemBinDefaultDto { inventoryItemId: string; branchId: string; binId: string | null }

export interface SupplierStandingDto { supplierId: string; code: string | null; balance: number; onOrder: number; creditLimit: number | null; available: number | null; currencyCode: string }

export interface WorkstationLineRequest {
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  discountPercent: number;
  taxRatePercent: number;
  expiryDate?: string | null;
  binId?: string | null;
  packName?: string | null;
  packSize?: number | null;
  packCount?: number | null;
  note?: string | null;
}

export interface SaveWorkstationOrderRequest {
  documentType: PurchaseDocumentType;
  branchId: string;
  sourceBranchId?: string | null;
  supplierId?: string | null;
  invoiceRef?: string | null;
  paymentTermsDays?: number | null;
  taxInclusive: boolean;
  courier?: string | null;
  waybill?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  rowVersion?: string | null;
  lines: WorkstationLineRequest[];
}

export interface WorkstationLineDto {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  groupName: string | null;
  unit: StockUnit;
  containerSize: number | null;
  purchaseUnitName: string | null;
  purchaseUnitSize: number | null;
  tracksBatches: boolean;
  tracksSerials: boolean;
  quantity: number;
  quantityReceived: number;
  unitCost: number;
  discountPercent: number;
  taxRatePercent: number;
  expiryDate: string | null;
  binId: string | null;
  binCode: string | null;
  packName: string | null;
  packSize: number | null;
  packCount: number | null;
  note: string | null;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
  onHand: number;
}

export interface WorkstationActionsDto {
  canEdit: boolean; canPost: boolean; canApprove: boolean; canReject: boolean; canCancel: boolean; canReceive: boolean; canPay: boolean; canEmail: boolean; canCloseShort: boolean;
  receiveBlockedReason: string | null;
}

export interface ReceiptSummaryDto { id: string; number: number; status: ReceiptStatus; receivedAtUtc: string; receivedByName: string | null; totalValue: number | null; lineCount: number }

export interface WorkstationOrderDto {
  id: string;
  number: number;
  documentNumber: string;
  documentType: PurchaseDocumentType;
  status: PurchaseOrderStatus;
  branchId: string;
  branchName: string;
  sourceBranchId: string | null;
  sourceBranchName: string | null;
  supplierId: string | null;
  supplier: SupplierDto | null;
  standing: SupplierStandingDto | null;
  invoiceRef: string | null;
  paymentTermsDays: number | null;
  taxInclusive: boolean;
  courier: string | null;
  waybill: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  overLimitReason: string | null;
  rejectionNote: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  dateCreated: string;
  postedAtUtc: string | null;
  approvedAtUtc: string | null;
  subtotal: number;
  discount: number;
  netInward: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
  currencyCode: string;
  lines: WorkstationLineDto[];
  receipts: ReceiptSummaryDto[];
  actions: WorkstationActionsDto;
  rowVersion: string;
}

export interface WorkstationListItemDto {
  id: string;
  number: number;
  documentNumber: string;
  documentType: PurchaseDocumentType;
  status: PurchaseOrderStatus;
  supplierName: string | null;
  branchName: string;
  total: number;
  lineCount: number;
  dateCreated: string;
  expectedDeliveryDate: string | null;
  awaitingSecondKey: boolean;
}

export interface AnalyseRequest { lines: { inventoryItemId: string; quantity: number; unitCost: number; discountPercent: number }[] }
export interface AnalyseLineDto { inventoryItemId: string; cost: number; retailRevenue: number | null; tradeRevenue: number | null; wholesaleRevenue: number | null; retailBasis: string }
export interface AnalyseDto {
  lines: AnalyseLineDto[];
  cost: number;
  retailRevenue: number;
  tradeRevenue: number;
  wholesaleRevenue: number;
  retailMarginPercent: number | null;
  tradeMarginPercent: number | null;
  wholesaleMarginPercent: number | null;
  unpricedLines: number;
}

export interface ReceivingLineDto {
  lineId: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  groupName: string | null;
  unit: StockUnit;
  containerSize: number | null;
  tracksBatches: boolean;
  tracksSerials: boolean;
  ordered: number;
  previouslyReceived: number;
  awaitingSecondKey: number;
  outstanding: number;
  unitCost: number | null;
  discountPercent: number | null;
  taxRatePercent: number | null;
  expiryDate: string | null;
  suggestedBinId: string | null;
  packName: string | null;
  packSize: number | null;
  tareExpectedGrams: number | null;
}

export interface DiscrepancyDto {
  id: string;
  kind: DiscrepancyKind;
  inventoryItemId: string | null;
  itemName: string | null;
  quantity: number | null;
  description: string;
  photoMediaIds: string[];
  recordedByName: string | null;
  recordedAtUtc: string;
  claimNumber: number | null;
  claimIssuedAtUtc: string | null;
}

export interface ReceivingManifestDto {
  orderId: string;
  documentNumber: string;
  documentType: PurchaseDocumentType;
  status: PurchaseOrderStatus;
  supplierName: string | null;
  branchId: string;
  branchName: string;
  sourceBranchName: string | null;
  invoiceRef: string | null;
  courier: string | null;
  waybill: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  postedAtUtc: string | null;
  expectedUnits: number;
  verifiedUnits: number;
  orderTotal: number | null;
  taxInclusive: boolean;
  canSeeCosts: boolean;
  tareTolerancePercent: number;
  canReceive: boolean;
  cannotReceiveReason: string | null;
  lines: ReceivingLineDto[];
  bins: BinDto[];
  receipts: ReceiptSummaryDto[];
  discrepancies: DiscrepancyDto[];
}

export interface ReceiveWorkstationLine {
  purchaseOrderLineId: string;
  acceptedQuantity: number;
  rejectedQuantity: number;
  binId?: string | null;
  lotCode?: string | null;
  expiryDate?: string | null;
  serials?: string[] | null;
  tareGramsPerUnit?: number | null;
  sealsIntact?: number | null;
  note?: string | null;
}

export interface DiscrepancyRequest { kind: DiscrepancyKind; inventoryItemId?: string | null; quantity?: number | null; description: string; photoMediaIds?: string[] | null }

export interface ReceiveWorkstationRequest {
  idempotencyKey: string;
  invoiceRef?: string | null;
  courier?: string | null;
  waybill?: string | null;
  dockBay?: string | null;
  temperatureC?: number | null;
  sealNumber?: string | null;
  sealIntact?: boolean | null;
  discrepancyNote?: string | null;
  lines: ReceiveWorkstationLine[];
  discrepancies?: DiscrepancyRequest[] | null;
}

export interface DirectReceiveRequest { order: SaveWorkstationOrderRequest; receipt: ReceiveWorkstationRequest }

export interface GoodsReceiptLineDto {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  unit: StockUnit;
  ordered: number;
  accepted: number;
  rejected: number;
  binId: string | null;
  binCode: string | null;
  binIsHighSecurity: boolean;
  lotCode: string | null;
  expiryDate: string | null;
  isPendingSecondKey: boolean;
  tareGramsPerUnit: number | null;
  tareExpectedGrams: number | null;
  tareWithinTolerance: boolean | null;
  sealsIntact: number | null;
  note: string | null;
  unitCost: number | null;
  lineValue: number | null;
}

export interface GoodsReceiptDto {
  id: string;
  number: number;
  status: ReceiptStatus;
  purchaseOrderId: string | null;
  documentNumber: string | null;
  documentType: PurchaseDocumentType | null;
  supplierName: string | null;
  branchName: string;
  invoiceRef: string | null;
  courier: string | null;
  waybill: string | null;
  dockBay: string | null;
  temperatureC: number | null;
  sealNumber: string | null;
  sealIntact: boolean | null;
  discrepancyNote: string | null;
  receivedByName: string | null;
  receivedAtUtc: string;
  secondVerifierName: string | null;
  secondVerifiedAtUtc: string | null;
  secondKeyNote: string | null;
  totalValue: number | null;
  canSecondKey: boolean;
  cannotSecondKeyReason: string | null;
  lines: GoodsReceiptLineDto[];
  discrepancies: DiscrepancyDto[];
}

export interface ReceivingQueueItemDto {
  orderId: string;
  documentNumber: string;
  documentType: PurchaseDocumentType;
  status: PurchaseOrderStatus;
  supplierName: string | null;
  branchName: string;
  expectedUnits: number;
  receivedUnits: number;
  expectedDeliveryDate: string | null;
  approvedAtUtc: string | null;
}

export interface ReceivingQueueDto { orders: ReceivingQueueItemDto[]; awaitingSecondKey: ReceiptSummaryDto[]; awaitingSecondKeyOrderIds: string[] }

export interface ClaimSlipLineDto { itemName: string; sku: string | null; unit: StockUnit; ordered: number; received: number; short: number; unitCost: number | null; value: number | null }
export interface ClaimSlipDto {
  claimNumber: number;
  issuedAtUtc: string;
  documentNumber: string;
  supplierName: string | null;
  invoiceRef: string | null;
  branchName: string;
  issuedByName: string | null;
  claimValue: number | null;
  lines: ClaimSlipLineDto[];
  discrepancies: DiscrepancyDto[];
}

export interface EmailOrderResultDto { delivered: boolean; message: string; sentTo: string | null }
