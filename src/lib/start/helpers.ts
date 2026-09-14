import { getVipCommissionRate } from '@/lib/vip-config';

export interface Product {
  id: string;
  name: string;
  merchant: string;
  price: number;
  category: string;
  categoryTint: 'default' | 'secondary' | 'success' | 'warning' | 'danger';
  image: string;
  minVip: number;
  isLucky: boolean;
  luckyCommissionPercent: number;
}

export interface AssignedTask {
  orderNumber: string;
  taskNumber: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  commission: number;
  estimatedEarnings: number;
  lucky: boolean;
  vipLevel: number;
  merchant: string;
  createdAt: string;
  note: string;
}

export function getRemainingTasks(completed: number, limit: number): number {
  return Math.max(0, limit - completed);
}

export function generateOrderNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = Math.floor(100000 + Math.random() * 900000);
  return `NBX-${ymd}-${seq}`;
}

export function generateTaskNumber(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `TASK-${rand}`;
}

export function buildTask(
  product: Product,
  vipLevel: number,
  userLuckyCommissionPercent?: number
): AssignedTask {
  const quantity = 1;
  const unitPrice = product.price;
  const totalPrice = unitPrice * quantity;
  const commissionRate = product.isLucky
    ? (userLuckyCommissionPercent != null ? userLuckyCommissionPercent : product.luckyCommissionPercent)
    : getVipCommissionRate(vipLevel);
  const commission = parseFloat((totalPrice * commissionRate / 100).toFixed(2));
  const estimatedEarnings = commission;

  return {
    orderNumber: generateOrderNumber(),
    taskNumber: generateTaskNumber(),
    product,
    quantity,
    unitPrice,
    totalPrice,
    commission,
    estimatedEarnings,
    lucky: product.isLucky,
    vipLevel,
    merchant: product.merchant,
    createdAt: new Date().toISOString(),
    note: '',
  };
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
