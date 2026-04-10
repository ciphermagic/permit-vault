'use client';

import { useState } from 'react';
import { Toaster } from 'sonner';

import { DevToolsPanel } from './components/DevToolsPanel';
import { PositionPanel } from './components/PositionPanel';
import { RewardPanel } from './components/RewardPanel';
import { StakePanel } from './components/StakePanel';

// 只在本地 anvil 网络显示开发工具
const IS_LOCAL = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '0') === 31337;

const tabs = [
  { key: 'stake',    label: '质押' },
  { key: 'reward',   label: '领取收益' },
  { key: 'position', label: '我的仓位' },
] as const;

export default function PermitVaultPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('stake');

  return (
    <main className='min-h-screen bg-black px-6 py-10 text-white'>
      {/* sonner Toast 容器：放在最外层，全局生效 */}
      <Toaster
        position='top-right'
        theme='dark'
        richColors
        closeButton
        toastOptions={{
          style: { fontFamily: 'inherit' },
        }}
      />

      <div className='mx-auto max-w-5xl'>

        {/* ── Header ── */}
        <div className='mb-8 flex items-start justify-between'>
          <div>
            <h1 className='text-4xl font-bold'>PermitVault</h1>
            <p className='mt-3 text-zinc-400'>
              把 Permit 授权、收益积累、线性解锁和仓位管理，整合到一个极致顺滑的 Web3 质押体验里。
            </p>
          </div>
          <div className='shrink-0 pt-1'>
            <appkit-button />
          </div>
        </div>

        {/* ── Tab 切换 ── */}
        <div className='mb-6 flex gap-3'>
          {tabs.map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                tab === item.key ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {IS_LOCAL && (
          <div className='mt-6'>
            <DevToolsPanel />
          </div>
        )}

        {tab === 'stake'    && <StakePanel />}
        {tab === 'reward'   && <RewardPanel />}
        {tab === 'position' && <PositionPanel />}
      </div>
    </main>
  );
}