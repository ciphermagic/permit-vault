'use client';

import { formatEther } from 'viem';
import { toast } from 'sonner';

import { usePermitVault } from '../hooks/usePermitVault';
import { parseContractError } from '../utils/contractErrors';

/**
 * 奖励生命周期（单轮锁仓版）：
 *
 *  [阶段 1] 未质押 (empty)
 *    尚未开始
 *
 *  [阶段 2] Cliff 锁定期 (cliff)
 *    首次质押后自动开始倒计时
 *    奖励持续累积，但不可领取
 *
 *  [阶段 3] 线性释放中 (vesting)
 *    Cliff 结束后，奖励按单轮进度逐步解锁
 *    可随时领取已解锁部分
 *
 *  [阶段 4] 全部解锁 (done)
 *    锁仓进度已完成
 *    当前及后续新增奖励均可随时领取
 */

export function RewardPanel() {
  const { stakeInfo, claimReward, isPending } = usePermitVault();

  const data = stakeInfo.data as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint] | undefined;

  // getStakeInfo 返回顺序：
  // [0] ethStaked  [1] tokenStaked  [2] earned  [3] releasable
  // [4] vestedTotal  [5] alreadyClaimed  [6] lockProgress
  const ethStaked = data?.[0] ?? 0n;
  const tokenStaked = data?.[1] ?? 0n;
  const earned = data?.[2] ?? 0n;
  const claimable = data?.[3] ?? 0n;
  const vestedTotal = data?.[4] ?? 0n;
  const alreadyClaimed = data?.[5] ?? 0n;
  const progress = Number(data?.[6] ?? 0n);

  const totalReward = vestedTotal || earned;

  const lockedAmount = totalReward > alreadyClaimed + claimable ? totalReward - alreadyClaimed - claimable : 0n;

  const hasStake = ethStaked > 0n || tokenStaked > 0n;
  const hasAnyReward = totalReward > 0n || alreadyClaimed > 0n;

  const phase: 'empty' | 'cliff' | 'vesting' | 'done' = (() => {
    if (!hasStake && !hasAnyReward) return 'empty';
    if (progress === 0 && claimable === 0n) return 'cliff';
    if (progress < 100) return 'vesting';
    return 'done';
  })();

  const phaseBanner: Record<typeof phase, { color: string; icon: string; text: string }> = {
    empty: {
      color: 'border-zinc-700/50 bg-zinc-900/50 text-zinc-500',
      icon: '💤',
      text: '质押 ETH 或 ERC20 后，Cliff 倒计时会自动开始，无需额外操作。',
    },
    cliff: {
      color: 'border-blue-800/50 bg-blue-950/40 text-blue-400',
      icon: '⏳',
      text: '处于 Cliff 锁定期，奖励持续累积中。锁定结束后会按单轮进度线性释放。',
    },
    vesting: {
      color: 'border-amber-800/50 bg-amber-950/40 text-amber-400',
      icon: '📈',
      text: '线性释放进行中，可随时领取当前已解锁部分。',
    },
    done: {
      color: 'border-emerald-800/50 bg-emerald-950/40 text-emerald-400',
      icon: '🎉',
      text: '锁仓进度已完成，当前及后续新增奖励都可随时领取。',
    },
  };

  const banner = phaseBanner[phase];

  const handleClaim = async () => {
    if (claimable === 0n) {
      toast.warning(banner.text);
      return;
    }

    try {
      await toast.promise(claimReward(), {
        loading: '领取中，请在钱包确认交易…',
        success: `成功领取 ${parseFloat(formatEther(claimable)).toFixed(4)} RDT 🎉`,
        error: err => parseContractError(err),
      });
    } catch {
      // toast.promise 已处理
    }
  };

  return (
    <div className='space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-6'>
      <h3 className='text-lg font-semibold text-white'>收益面板</h3>

      <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${banner.color}`}>
        <span className='mt-px shrink-0'>{banner.icon}</span>
        <span>{banner.text}</span>
      </div>

      <div className='grid gap-3 md:grid-cols-2'>
        <Stat label='累计奖励' sublabel='当前累计产生的奖励总额' value={fmt(totalReward)} dim={totalReward === 0n} />
        <Stat
          label='未解锁'
          sublabel='按当前锁仓进度尚未释放的部分'
          value={fmt(lockedAmount)}
          dim={lockedAmount === 0n}
        />
        <Stat
          label='可领取'
          sublabel='当前可铸造为 RDT'
          value={fmt(claimable)}
          highlight={claimable > 0n}
          dim={claimable === 0n}
        />
        <Stat label='已领取' sublabel='累计已领取总量' value={fmt(alreadyClaimed)} dim={alreadyClaimed === 0n} />
      </div>

      <div>
        <div className='mb-2 flex items-center justify-between text-sm'>
          <span className='text-zinc-400'>Vesting 释放进度</span>
          <span className={progress > 0 ? 'text-white' : 'text-zinc-600'}>
            {phase === 'empty' ? '— 未质押' : phase === 'cliff' ? 'Cliff 锁定中' : `${progress}%`}
          </span>
        </div>

        <div className='h-2.5 overflow-hidden rounded-full bg-zinc-800'>
          <div
            className='h-2.5 rounded-full bg-blue-600 transition-all duration-700'
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <div className='mt-1.5 flex justify-between text-[10px] text-zinc-600'>
          <span>Cliff（1 min）</span>
          <span>线性释放（2 min）</span>
          <span>100%</span>
        </div>
      </div>

      <button
        onClick={handleClaim}
        disabled={isPending || claimable === 0n}
        className='flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-40'
      >
        {isPending && <Spinner />}
        {isPending ? '领取中…' : claimable > 0n ? `领取 ${fmt(claimable)} RDT` : '领取收益'}
      </button>
    </div>
  );
}

function Stat({
  label,
  sublabel,
  value,
  highlight,
  dim,
}: {
  label: string;
  sublabel: string;
  value: string;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        highlight ? 'border-amber-700/60 bg-amber-950/30' : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      <div className='text-sm font-medium text-zinc-300'>{label}</div>
      <div className='text-[10px] text-zinc-600'>{sublabel}</div>
      <div
        className={`mt-2 break-all text-xl font-semibold ${
          highlight ? 'text-amber-400' : dim ? 'text-zinc-600' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className='h-4 w-4 animate-spin' viewBox='0 0 24 24' fill='none'>
      <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
      <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z' />
    </svg>
  );
}

function fmt(val: bigint) {
  return (
    parseFloat(formatEther(val))
      .toFixed(6)
      .replace(/\.?0+$/, '') || '0'
  );
}
