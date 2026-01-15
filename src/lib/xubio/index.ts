// Exportaciones del módulo Xubio

// Cliente HTTP
export { testXubioConnection, invalidateXubioToken } from './client';

// Clientes
export {
  syncClientToXubio,
  ensureXubioCustomer,
  mapTaxConditionToXubio,
} from './customers';

// Facturas
export {
  createDepositInvoice,
  createBalanceInvoice,
  getXubioInvoice,
  previewInvoice,
  getInvoiceType,
} from './invoices';

// Recibos
export {
  createReceipt,
  createDepositReceipt,
  createBalanceReceipt,
  getXubioReceipt,
} from './receipts';

// Remitos
export {
  createRemito,
  getXubioRemito,
  previewRemito,
  generateRemitoPrintHtml,
} from './remitos';

// Cheques
export { listXubioChecks, getXubioCheck } from './checks';

// Tipos
export * from './types';
