'use client';

import { useState } from 'react';
import { formatEther, parseEther, type Address } from 'viem';
import { useReadContract } from 'wagmi';
import { toast } from 'sonner';

import { usePermitVault } from '../hooks/usePermitVault';
import { parseContractError } from '../utils/contractErrors';

const STAKE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_STAKE_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
const REWARD_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_REWARD_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
const VAULT_ADDRESS        = (process.env.NEXT_PUBLIC_VAULT_ADDRESS        || '0x0000000000000000000000000000000000000000') as Address;

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const vaultAbi = [
  {
    type: 'function',
    name: 'stakeTimestamp',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export function PositionPanel() {
  const { address, stakeInfo, withdraw, isPending } = usePermitVault();
  const [ethWithdraw,   setEthWithdraw]   = useState('');
  const [tokenWithdraw, setTokenWithdraw] = useState('');

  const data = stakeInfo.data as
    | readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint]
    | undefined;

  const ethStaked   = data?.[0] ?? 0n;
  const tokenStaked = data?.[1] ?? 0n;
  // data[2] = earned (奖励), 不是时间戳。stakeTimestamp 需单独从合约 mapping 读取
  const { data: stakedAtRaw } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'stakeTimestamp',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const stakedAt = (stakedAtRaw as bigint | undefined) ?? 0n;

  const rewardBalance = useReadContract({
    address: REWARD_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // ── 内联校验（上限是已质押量，而非钱包余额）──────────────────
  const ethWithdrawError = (() => {
    if (!ethWithdraw) return null;
    const val = parseFloat(ethWithdraw);
    if (isNaN(val) || val <= 0) return '请输入有效金额';
    try {
      if (parseEther(ethWithdraw) > ethStaked)
        return `超出质押量（最多 ${fmtStaked(ethStaked)} ETH）`;
    } catch { return '请输入有效金额'; }
    return null;
  })();

  const tokenWithdrawError = (() => {
    if (!tokenWithdraw) return null;
    const val = parseFloat(tokenWithdraw);
    if (isNaN(val) || val <= 0) return '请输入有效金额';
    try {
      if (parseEther(tokenWithdraw) > tokenStaked)
        return `超出质押量（最多 ${fmtStaked(tokenStaked)} PKT）`;
    } catch { return '请输入有效金额'; }
    return null;
  })();

  // ── 提款操作 ──────────────────────────────────────────────
  const handleWithdraw = async (token: Address, amount: string, label: string) => {
    if (!amount) { toast.error('请输入提款金额'); return; }
    try {
      await toast.promise(
        withdraw(token, amount),
        {
          loading: '提取中，请在钱包确认…',
          success: `成功提取 ${amount} ${label} ✅`,
          error:   (err) => parseContractError(err),
        },
      );
      if (token === '0x0000000000000000000000000000000000000000') setEthWithdraw('');
      else setTokenWithdraw('');
    } catch {
      // toast.promise 已处理
    }
  };

  return (
    <div className='space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-6'>
      <h3 className='text-lg font-semibold text-white'>我的仓位</h3>

      {/* ── 仓位概览 ── */}
      <div className='grid gap-4 md:grid-cols-2'>
        <Stat label='ETH 质押量'       value={fmtStaked(ethStaked)}   unit='ETH' />
        <Stat label='ERC20 质押量'     value={fmtStaked(tokenStaked)} unit='PKT' />
        <Stat
          label='质押时间'
          value={stakedAt === 0n ? '–' : new Date(Number(stakedAt) * 1000).toLocaleString()}
        />
        <Stat
          label='RebaseToken 余额'
          value={fmtStaked((rewardBalance.data as bigint | undefined) ?? 0n)}
          unit='RDT'
        />
      </div>

      {/* ── 提款区域 ── */}
      <div className='grid gap-4 md:grid-cols-2'>

        {/* 提取 ETH */}
        <div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4'>
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-sm text-zinc-400'>提取 ETH</span>
            {/* MAX 按钮显示并填入已质押量，而非钱包余额 */}
            <StakedBadge
              value={fmtStaked(ethStaked)}
              unit='ETH'
              onClick={() => ethStaked > 0n && setEthWithdraw(formatEther(ethStaked))}
            />
          </div>
          <div className='flex gap-2'>
            <input
              value={ethWithdraw}
              onChange={e => setEthWithdraw(e.target.value)}
              placeholder='输入 ETH 数量'
              className={`flex-1 rounded-lg border bg-zinc-950 px-4 py-2 text-white outline-none transition-colors ${
                ethWithdrawError
                  ? 'border-rose-500 focus:border-rose-400'
                  : 'border-zinc-700 focus:border-rose-500'
              }`}
            />
            <button
              onClick={() => handleWithdraw('0x0000000000000000000000000000000000000000', ethWithdraw, 'ETH')}
              disabled={isPending || !ethWithdraw || !!ethWithdrawError || ethStaked === 0n}
              className='rounded-lg bg-rose-600 px-4 py-2 text-white disabled:opacity-50 hover:bg-rose-500 transition-colors'
            >
              提取
            </button>
          </div>
          {ethWithdrawError && <p className='mt-1.5 text-xs text-rose-400'>{ethWithdrawError}</p>}
          {!ethWithdrawError && ethStaked === 0n && (
            <p className='mt-1.5 text-xs text-zinc-600'>暂无 ETH 质押量</p>
          )}
        </div>

        {/* 提取 ERC20 */}
        <div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4'>
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-sm text-zinc-400'>提取 ERC20</span>
            <StakedBadge
              value={fmtStaked(tokenStaked)}
              unit='PKT'
              onClick={() => tokenStaked > 0n && setTokenWithdraw(formatEther(tokenStaked))}
            />
          </div>
          <div className='flex gap-2'>
            <input
              value={tokenWithdraw}
              onChange={e => setTokenWithdraw(e.target.value)}
              placeholder='输入代币数量'
              className={`flex-1 rounded-lg border bg-zinc-950 px-4 py-2 text-white outline-none transition-colors ${
                tokenWithdrawError
                  ? 'border-rose-500 focus:border-rose-400'
                  : 'border-zinc-700 focus:border-rose-500'
              }`}
            />
            <button
              onClick={() => handleWithdraw(STAKE_TOKEN_ADDRESS, tokenWithdraw, 'PKT')}
              disabled={isPending || !tokenWithdraw || !!tokenWithdrawError || tokenStaked === 0n}
              className='rounded-lg bg-rose-600 px-4 py-2 text-white disabled:opacity-50 hover:bg-rose-500 transition-colors'
            >
              提取
            </button>
          </div>
          {tokenWithdrawError && <p className='mt-1.5 text-xs text-rose-400'>{tokenWithdrawError}</p>}
          {!tokenWithdrawError && tokenStaked === 0n && (
            <p className='mt-1.5 text-xs text-zinc-600'>暂无 ERC20 质押量</p>
          )}
        </div>

      </div>
    </div>
  );
}

// ── 工具函数 & 子组件 ─────────────────────────────────────────

function fmtStaked(val: bigint) {
  return parseFloat(formatEther(val)).toFixed(4).replace(/\.?0+$/, '') || '0';
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4'>
      <div className='text-sm text-zinc-400'>{label}</div>
      <div className='mt-2 text-lg font-semibold text-white break-all'>
        {value}
        {unit && <span className='ml-1 text-sm font-normal text-zinc-500'>{unit}</span>}
      </div>
    </div>
  );
}

// 提款区的 badge：显示已质押量（MAX = 全额提取）
function StakedBadge({ value, unit, onClick }: { value: string; unit: string; onClick?: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      title='点击填入全部已质押量'
      className='flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs transition hover:border-zinc-500 hover:bg-zinc-700 active:scale-95'
    >
      <span className='text-zinc-500'>已质押</span>
      <span className='font-semibold text-zinc-200'>{value}</span>
      <span className='text-zinc-500'>{unit}</span>
    </button>
  );
}