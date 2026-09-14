import { useNavigate } from 'react-router-dom';
import { Crown, ChevronRight } from 'lucide-react';
import { getNextVipTier } from '@/lib/vip-config';

interface VipSidebarCardProps {
  vipLevel: number;
  currentBalance: number;
}

export function VipSidebarCard({ vipLevel, currentBalance }: VipSidebarCardProps) {
  const navigate = useNavigate();
  const nextTier = getNextVipTier(vipLevel);
  const threshold = nextTier?.minDeposit ?? currentBalance;
  const progress = nextTier
    ? Math.min((currentBalance / threshold) * 100, 100)
    : 100;
  const remaining = nextTier ? Math.max(threshold - currentBalance, 0) : 0;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-pink-50 p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Crown className="size-5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">Your VIP Level</p>
          <p className="text-base font-bold text-slate-800">VIP{vipLevel}</p>
        </div>
      </div>

      {nextTier ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>${currentBalance.toLocaleString()} USD</span>
            <span>${threshold.toLocaleString()} USD</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Need ${remaining.toLocaleString()} more for VIP{nextTier.level}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-400">Maximum tier reached</p>
      )}

      <button
        onClick={() => navigate('/account')}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50"
      >
        Explore VIP Benefits
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
