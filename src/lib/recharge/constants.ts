export type PaymentMethod = 'bank' | 'usdt';
export type DepositStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentMethodInfo {
  id: PaymentMethod;
  label: string;
  description: string;
  icon: 'bank' | 'crypto';
  tint: string;
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
}

export interface UsdtDetails {
  walletAddress: string;
  network: string;
}

export const presetAmounts = [50, 100, 200, 500, 1000];

export const paymentMethods: PaymentMethodInfo[] = [
  {
    id: 'bank',
    label: 'Bank Transfer',
    description: 'Direct wire transfer to our escrow account',
    icon: 'bank',
    tint: 'from-primary to-secondary',
  },
  {
    id: 'usdt',
    label: 'USDT (TRC20)',
    description: 'Tether on the Tron network — fast & low fees',
    icon: 'crypto',
    tint: 'from-success to-primary',
  },
];

export const bankDetails: BankDetails = {
  bankName: 'First National Escrow Bank',
  accountName: 'Hawksem Digital Marketing Agency',
  accountNumber: '8842  5671  9023',
  routingNumber: '021000021',
};

export const usdtDetails: UsdtDetails = {
  walletAddress: 'TQn9Y2khEsLJW7B2nF5rV4xQ8mPd6cZ1a',
  network: 'TRC20 (Tron)',
};

export const timelineSteps = [
  {
    id: 't1',
    label: 'Payment Submitted',
    description: 'Your deposit request has been received',
    icon: 'Upload',
  },
  {
    id: 't2',
    label: 'Waiting Verification',
    description: 'Our finance team is reviewing your payment',
    icon: 'Clock',
  },
  {
    id: 't3',
    label: 'Approved',
    description: 'Funds credited to your wallet balance',
    icon: 'CheckCircle2',
  },
];
