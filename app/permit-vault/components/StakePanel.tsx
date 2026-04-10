'use client';

import { useState } from 'react';
import { useAccount, useSignTypedData, useBalance, useReadContract, useWriteContract } from 'wagmi';
import { parseEther, formatEther, maxUint256, type Address } from 'viem';
import { toast } from 'sonner';

import { usePermitVault } from '../hooks/usePermitVault';
import { buildPermit2TypedData } from '../utils/permit2';
import { parseContractError } from '../utils/contractErrors';

const STAKE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_STAKE_TOKEN_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;
const PERMIT2_ADDRESS = (process.env.NEXT_PUBLIC_PERMIT2_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');

// Permit2 bitmap nonce：随机 uint256，bitmap 保证不可重用
function randomPermit2Nonce(): bigint {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return BigInt(
    '0x' +
      Array.from(arr)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
  );
}

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

// Permit2 存款的步骤状态
type PermitStep = 'idle' | 'signing' | 'sending';

export function StakePanel() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const { depositETH, depositWithPermit2, vaultAddress, isPending } = usePermitVault();

  const [ethAmount, setEthAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [permitStep, setPermitStep] = useState<PermitStep>('idle');
  const [isApproving, setIsApproving] = useState(false);

  // ── 钱包余额 ──────────────────────────────────────────────
  const { data: ethBalance } = useBalance({
    address,
    query: { enabled: !!address },
  });

  const { data: tokenBalance } = useReadContract({
    address: STAKE_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // ── Permit2 授权额度检测 ──────────────────────────────────
  // 只要 allowance > 0 就视为已授权（用户可能设置了任意金额）
  const { data: permit2Allowance, refetch: refetchAllowance } = useReadContract({
    address: STAKE_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, PERMIT2_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const isApproved = permit2Allowance !== undefined && (permit2Allowance as bigint) > 0n;

  // ── 内联校验 ──────────────────────────────────────────────
  const ethError = (() => {
    if (!ethAmount) return null;
    const val = parseFloat(ethAmount);
    if (isNaN(val) || val <= 0) return '请输入有效金额';
    if (ethBalance && parseEther(ethAmount) > ethBalance.value)
      return `余额不足（钱包：${parseFloat(formatEther(ethBalance.value)).toFixed(4)} ETH）`;
    return null;
  })();

  const tokenError = (() => {
    if (!tokenAmount) return null;
    const val = parseFloat(tokenAmount);
    if (isNaN(val) || val <= 0) return '请输入有效金额';
    if (tokenBalance && parseEther(tokenAmount) > (tokenBalance as bigint))
      return `余额不足（钱包：${parseFloat(formatEther(tokenBalance as bigint)).toFixed(4)} PKT）`;
    return null;
  })();

  const fmtBalance = (val: bigint | undefined) =>
    val !== undefined
      ? parseFloat(formatEther(val))
          .toFixed(4)
          .replace(/\.?0+$/, '')
      : '–';

  // ── 一次性 Approve Permit2 ────────────────────────────────
  const handleApprove = async () => {
    if (!address) {
      toast.error('请先连接钱包');
      return;
    }
    setIsApproving(true);
    try {
      await toast.promise(
        writeContractAsync({
          address: STAKE_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [PERMIT2_ADDRESS, maxUint256],
        }).then(() => refetchAllowance()),
        {
          loading: '授权中，请在钱包确认…',
          success: '授权成功！现在可以使用 Permit2 一键存款了 ✅',
          error: err => parseContractError(err),
        },
      );
    } catch {
      // toast.promise 已处理
    } finally {
      setIsApproving(false);
    }
  };

  // ── ETH 存款 ──────────────────────────────────────────────
  const handleDepositETH = async () => {
    if (!address) {
      toast.error('请先连接钱包');
      return;
    }
    if (!ethAmount || ethError) {
      toast.error(ethError || '请输入金额');
      return;
    }

    try {
      await toast.promise(
        depositETH(ethAmount).then(() => setEthAmount('')),
        {
          loading: '交易提交中，请在钱包确认…',
          success: `成功质押 ${ethAmount} ETH 🎉`,
          error: err => parseContractError(err),
        },
      );
    } catch {
      // toast.promise 已处理
    }
  };

  // ── Permit2 ERC20 存款（两步：签名 → 上链）────────────────
  const handlePermitDeposit = async () => {
    if (!address) {
      toast.error('请先连接钱包');
      return;
    }
    if (!isApproved) {
      toast.error('请先完成 Permit2 一次性授权');
      return;
    }
    if (!tokenAmount || tokenError) {
      toast.error(tokenError || '请输入金额');
      return;
    }

    const toastId = 'permit-deposit';
    try {
      // Step 1：请求链下签名
      setPermitStep('signing');
      toast.loading('第 1 步 / 2：请在钱包中确认签名（无需支付 Gas）', { id: toastId });

      const nonce = randomPermit2Nonce();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const typedData = buildPermit2TypedData(
        STAKE_TOKEN_ADDRESS,
        parseEther(tokenAmount),
        vaultAddress,
        nonce,
        deadline,
        address,
        CHAIN_ID,
        PERMIT2_ADDRESS,
      );

      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      // Step 2：发送链上交易
      setPermitStep('sending');
      toast.loading('第 2 步 / 2：交易上链中，请稍候…', { id: toastId });

      await depositWithPermit2(tokenAmount, nonce, deadline, signature);

      toast.success(`成功存入 ${tokenAmount} PKT 🎉`, { id: toastId });
      setTokenAmount('');
    } catch (err) {
      toast.error(parseContractError(err), { id: toastId });
    } finally {
      setPermitStep('idle');
    }
  };

  const isPermitBusy = permitStep !== 'idle' || isPending;

  return (
    <div className='space-y-6 rounded-xl border border-zinc-800 bg-zinc-950/70 p-6'>
      {/* ── 未连接钱包提示 ── */}
      {!address && (
        <div className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400'>
          ⚠️ 请先点击右上角连接钱包，再进行质押操作
        </div>
      )}

      {/* ── ETH 质押 ── */}
      <div>
        <div className='mb-3 flex items-center justify-between'>
          <h3 className='text-lg font-semibold text-white'>质押 ETH</h3>
          <BalanceBadge
            value={fmtBalance(ethBalance?.value)}
            unit='ETH'
            onClick={() => ethBalance && setEthAmount(formatEther(ethBalance.value))}
          />
        </div>
        <div className='flex gap-3'>
          <input
            value={ethAmount}
            onChange={e => setEthAmount(e.target.value)}
            placeholder='输入 ETH 数量'
            className={`flex-1 rounded-lg border bg-zinc-900 px-4 py-2 text-white outline-none transition-colors ${
              ethError ? 'border-rose-500 focus:border-rose-400' : 'border-zinc-700 focus:border-blue-500'
            }`}
          />
          <button
            onClick={handleDepositETH}
            disabled={isPending || !!ethError}
            className='rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50 hover:bg-blue-500 transition-colors'
          >
            质押 ETH
          </button>
        </div>
        {ethError && <p className='mt-1.5 text-xs text-rose-400'>{ethError}</p>}
      </div>

      {/* ── ERC20 Permit 存入 ── */}
      <div>
        <div className='mb-3 flex items-center justify-between'>
          <h3 className='text-lg font-semibold text-white'>Permit 一键存入 ERC20</h3>
          <BalanceBadge
            value={fmtBalance(tokenBalance as bigint | undefined)}
            unit='PKT'
            onClick={() => tokenBalance && setTokenAmount(formatEther(tokenBalance as bigint))}
          />
        </div>

        {/* ── Permit2 授权状态卡片 ── */}
        {address && (
          <div
            className={`mb-3 flex items-center justify-between rounded-lg border px-4 py-3 ${
              isApproved ? 'border-emerald-800/50 bg-emerald-950/40' : 'border-amber-700/50 bg-amber-950/40'
            }`}
          >
            <div className='flex items-center gap-2'>
              {/* 状态图标 */}
              {isApproved ? (
                <span className='flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs'>
                  ✓
                </span>
              ) : (
                <span className='flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-xs'>
                  !
                </span>
              )}
              <div>
                <p className={`text-sm font-medium ${isApproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isApproved ? 'Permit2 已授权' : '需要一次性授权'}
                </p>
                <p className='text-xs text-zinc-500'>
                  {isApproved
                    ? '后续每次存款只需签名，无需再次 approve'
                    : '首次使用 Permit2 存款前，需先授权 Permit2 合约'}
                </p>
              </div>
            </div>
            {!isApproved && (
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className='flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-60 hover:bg-amber-400 transition-colors'
              >
                {isApproving && <Spinner dark />}
                {isApproving ? '授权中…' : '一键授权'}
              </button>
            )}
          </div>
        )}

        {/* 输入 + 存款按钮 */}
        <div className='flex gap-3'>
          <input
            value={tokenAmount}
            onChange={e => setTokenAmount(e.target.value)}
            placeholder='输入代币数量'
            disabled={!isApproved}
            className={`flex-1 rounded-lg border bg-zinc-900 px-4 py-2 text-white outline-none transition-colors disabled:opacity-40 ${
              tokenError ? 'border-rose-500 focus:border-rose-400' : 'border-zinc-700 focus:border-emerald-500'
            }`}
          />
          <button
            onClick={handlePermitDeposit}
            disabled={isPermitBusy || !!tokenError || !isApproved}
            className='min-w-[96px] rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-50 hover:bg-emerald-500 transition-colors'
          >
            {isPermitBusy ? <Spinner /> : 'Permit 存入'}
          </button>
        </div>
        {tokenError && <p className='mt-1.5 text-xs text-rose-400'>{tokenError}</p>}

        {/* Permit2 步骤指示器（存款进行中时显示） */}
        {permitStep !== 'idle' && (
          <div className='mt-3 flex items-center gap-2'>
            <StepDot active={permitStep === 'signing'} done={permitStep === 'sending'} />
            <span className={`text-xs ${permitStep === 'signing' ? 'text-emerald-400' : 'text-zinc-400'}`}>
              签名授权（免 Gas）
            </span>
            <div className='h-px w-8 bg-zinc-700' />
            <StepDot active={permitStep === 'sending'} done={false} />
            <span className={`text-xs ${permitStep === 'sending' ? 'text-emerald-400' : 'text-zinc-500'}`}>
              交易上链
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────

function BalanceBadge({ value, unit, onClick }: { value: string; unit: string; onClick?: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      title='点击填入最大值'
      className='flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-95'
    >
      <span className='text-zinc-500'>钱包</span>
      <span className='font-semibold text-zinc-200'>{value}</span>
      <span className='text-zinc-500'>{unit}</span>
      <span className='ml-0.5 rounded bg-zinc-700 px-1 py-0.5 text-[10px] font-bold text-zinc-300'>MAX</span>
    </button>
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className={`h-2 w-2 rounded-full transition-colors ${
        done ? 'bg-emerald-500' : active ? 'animate-pulse bg-emerald-400' : 'bg-zinc-600'
      }`}
    />
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span className='flex items-center justify-center'>
      <svg className={`h-4 w-4 animate-spin ${dark ? 'text-black' : 'text-white'}`} viewBox='0 0 24 24' fill='none'>
        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z' />
      </svg>
    </span>
  );
}
