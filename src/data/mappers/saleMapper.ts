import { SaleRecord, SaleItem } from '@shared/types/index';

export const saleMapper = {
  fromRow(row: any): SaleRecord {
    return {
      id: row.id,
      registerId: row.register_id || '',
      ticketNumber: row.ticket_number,
      timestamp: row.created_at,
      items: (row.sale_items || []).map((si: any): SaleItem => ({
        productId: si.product_id,
        productName: si.product_name,
        quantity: Number(si.quantity),
        unitPrice: Number(si.unit_price),
        unitCost: Number(si.unit_cost),
        subtotal: Number(si.subtotal),
        profit: Number(si.profit),
      })),
      totalQuantity: Number(row.total_quantity),
      totalAmount: Number(row.total_amount),
      totalProfit: Number(row.total_profit),
      paymentMethod: row.payment_method,
      cashGiven: row.cash_given ? Number(row.cash_given) : undefined,
      changeGiven: row.change_given ? Number(row.change_given) : 0,
      cashierName: row.cashier_name,
    };
  },
};
