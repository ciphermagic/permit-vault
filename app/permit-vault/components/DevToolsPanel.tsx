'use client';

import { useState } from 'react';
import { usePublicClient } from 'wagmi';

const PRESETS = [
  { label: '+30s',   seconds: 30,  desc: 'Cliff 期间' },
  { label: '+1 min', seconds: 60,  desc: '跳过 Cliff' },
  { label: '+90s',   seconds: 90,  desc: 'Cliff 后进入释放' },
  { label: '+2 min', seconds: 120, desc: '走完 Vest 期' },
  { label: '+3 min', seconds: 180, desc: '全部解锁' },
] as const;

export function DevToolsPanel() {
  const client = usePublicClient();
  const [log, setLog]         = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const push = (msg: string) =>
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));

  const advance = async (seconds: number) => {
    if (!client) { push('❌ 未连接 RPC'); return; }
    setLoading(true);
    try {
      // 1. 快进时间
      await client.request({
        method: 'evm_increaseTime' as never,
        params: [seconds] as never,
      });
      // 2. 挖一个块让 block.timestamp 生效
      await client.request({
        method: 'evm_mine' as never,
        params: [] as never,
      });

      // 3. 读取新的 block.timestamp 用于展示
      const block = await client.getBlock();
      const ts = new Date(Number(block.timestamp) * 1000).toLocaleTimeString();
      push(`✅ 快进 ${seconds}s → 当前区块时间 ${ts}`);
    } catch (err) {
      push(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 p-4'>
      {/* 标题 */}
      <div className='mb-3 flex items-center gap-2'>
        <span className='rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500'>
          Dev Only
        </span>
        <h4 className='text-sm font-semibold text-zinc-400'>时间快进工具</h4>
        <span className='text-xs text-zinc-600'>（仅 anvil 本地节点有效）</span>
      </div>

      {/* 快进按钮 */}
      <div className='flex flex-wrap gap-2'>
        {PRESETS.map(({ label, seconds, desc }) => (
          <button
            key={seconds}
            onClick={() => advance(seconds)}
            disabled={loading}
            title={desc}
            className='group flex flex-col items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 transition hover:border-violet-600 hover:bg-violet-950/40 disabled:opacity-40'
          >
            <span className='text-sm font-semibold text-zinc-200 group-hover:text-violet-300'>
              {label}
            </span>
            <span className='text-[10px] text-zinc-600 group-hover:text-violet-500'>{desc}</span>
          </button>
        ))}

        {/* 自定义秒数 */}
        <CustomAdvance onAdvance={advance} loading={loading} />
      </div>

      {/* 日志输出 */}
      {log.length > 0 && (
        <div className='mt-3 max-h-28 overflow-y-auto rounded-lg bg-zinc-900 p-2'>
          {log.map((line, i) => (
            <p key={i} className='font-mono text-[11px] text-zinc-400'>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 自定义秒数输入 ─────────────────────────────────────────────
function CustomAdvance({
  onAdvance,
  loading,
}: {
  onAdvance: (s: number) => void;
  loading: boolean;
}) {
  const [val, setVal] = useState('');

  const handle = () => {
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) { onAdvance(n); setVal(''); }
  };

  return (
    <div className='flex items-center gap-1'>
      <input
        type='number'
        min='1'
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handle()}
        placeholder='自定义秒'
        className='w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white outline-none focus:border-violet-500'
      />
      <button
        onClick={handle}
        disabled={loading || !val}
        className='rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition hover:border-violet-600 hover:text-violet-300 disabled:opacity-40'
      >
        快进
      </button>
    </div>
  );
}