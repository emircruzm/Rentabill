import { PurchaseRecord, PurchaseItem } from '@shared/types/index';

export const purchaseMapper = {
  fromRow(row: any): PurchaseRecord {
    const total = Number(row.total_amount || row.total_cost || 0);
    return {
      id: row.id,
      storeId: row.store_id || '',
      supplierId: row.supplier_id || undefined,
      supplierName: row.suppliers?.name || 'Distribuidor',
      paymentCondition: row.payment_condition,
      creditDays: Number(row.credit_days || 0),
      dueDate: row.due_date || undefined,
      paidAt: row.paid_at || null,
      totalCost: total,
      totalAmount: total,
      notes: row.notes || null,
      createdAt: row.created_at,
      items: (row.purchase_items || []).map((pi: any): PurchaseItem => ({
        id: pi.id,
        purchaseId: pi.purchase_id,
        productId: pi.product_id,
        productName: pi.product_name,
        quantity: Number(pi.quantity),
        unitCost: Number(pi.unit_cost),
        subtotal: Number(pi.subtotal),
      })),
    };
  },
};
