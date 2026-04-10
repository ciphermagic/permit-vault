import Link from 'next/link';

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          height: 100%;
          overflow: hidden;
          background: #06080f;
          color: #f0f2f7;
          font-family: 'Inter', sans-serif;
        }

        /* ── 背景装饰 ── */
        .bg {
          position: fixed; inset: 0; z-index: 0; overflow: hidden;
        }
        .bg-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(99,179,237,0.08);
        }
        .bg-ring-1 { width: 900px; height: 900px; top: -340px; right: -180px; }
        .bg-ring-2 { width: 600px; height: 600px; top: -180px; right: 60px; border-color: rgba(99,179,237,0.05); }
        .bg-glow {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle, rgba(56,139,253,0.12) 0%, transparent 70%);
          width: 700px; height: 700px; top: -200px; right: -100px;
        }

        /* ── 레이아웃 ── */
        .page {
          position: relative; z-index: 1;
          height: 100vh;
          display: grid;
          grid-template-rows: 64px 1fr 72px;
          max-width: 1120px; margin: 0 auto; padding: 0 40px;
        }

        /* ── Nav ── */
        nav {
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .brand {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: 18px; letter-spacing: -0.02em; color: #f0f2f7;
        }
        .brand span { color: #63b3ed; }
        .status {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; color: #64748b; letter-spacing: 0.04em;
        }
        .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #34d399;
          box-shadow: 0 0 8px #34d399;
          animation: pulse 2.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:0.35; }
        }

        /* ── Main ── */
        main {
          display: grid;
          grid-template-columns: 1fr 420px;
          align-items: center;
          gap: 64px;
        }

        /* 左侧文案区 */
        .left {}
        .tag {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12px; color: #63b3ed; letter-spacing: 0.06em;
          background: rgba(99,179,237,0.08); border: 1px solid rgba(99,179,237,0.2);
          border-radius: 20px; padding: 5px 14px; margin-bottom: 28px;
        }
        .tag-dot { width: 5px; height: 5px; border-radius: 50%; background: #63b3ed; }

        h1 {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: clamp(36px, 4.5vw, 58px);
          line-height: 1.08; letter-spacing: -0.03em;
          margin-bottom: 20px;
        }
        h1 .sub { color: #64748b; font-weight: 600; }
        h1 .hl  { color: #63b3ed; }

        .desc {
          font-size: 15px; line-height: 1.75; color: #94a3b8;
          max-width: 440px; margin-bottom: 40px; font-weight: 300;
        }

        /* 三个价值点 */
        .values {
          display: flex; flex-direction: column; gap: 14px; margin-bottom: 44px;
        }
        .value {
          display: flex; align-items: flex-start; gap: 14px;
        }
        .value-icon {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px;
        }
        .value-icon.blue   { background: rgba(99,179,237,0.12); }
        .value-icon.purple { background: rgba(139,92,246,0.12); }
        .value-icon.green  { background: rgba(52,211,153,0.12); }
        .value-text strong {
          display: block; font-size: 13px; font-weight: 500; color: #e2e8f0; margin-bottom: 2px;
        }
        .value-text span { font-size: 12px; color: #64748b; line-height: 1.5; }

        .cta {
          display: inline-flex; align-items: center; gap: 10px;
          background: #63b3ed; color: #06080f;
          font-weight: 600; font-size: 14px; padding: 14px 28px;
          border-radius: 10px; text-decoration: none;
          box-shadow: 0 0 32px rgba(99,179,237,0.3);
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .cta:hover {
          box-shadow: 0 0 48px rgba(99,179,237,0.5);
          transform: translateY(-1px);
        }
        .cta-arrow { transition: transform 0.2s; font-size: 16px; }
        .cta:hover .cta-arrow { transform: translateX(4px); }

        /* 右侧卡片 */
        .card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; padding: 32px;
          backdrop-filter: blur(12px);
          box-shadow: 0 24px 64px rgba(0,0,0,0.4);
        }
        .card-title {
          font-size: 11px; color: #64748b; letter-spacing: 0.08em;
          text-transform: uppercase; margin-bottom: 24px;
          display: flex; align-items: center; gap: 8px;
        }
        .card-title::after {
          content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06);
        }

        /* 流程步骤 */
        .steps { display: flex; flex-direction: column; gap: 0; margin-bottom: 28px; }
        .step {
          display: flex; gap: 16px; align-items: flex-start;
          position: relative; padding-bottom: 20px;
        }
        .step:last-child { padding-bottom: 0; }
        .step-line {
          position: absolute; left: 15px; top: 32px; bottom: 0;
          width: 1px; background: rgba(255,255,255,0.06);
        }
        .step:last-child .step-line { display: none; }
        .step-num {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          border: 1px solid rgba(99,179,237,0.3);
          background: rgba(99,179,237,0.08);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600; color: #63b3ed;
          position: relative; z-index: 1;
        }
        .step-body strong {
          display: block; font-size: 13px; font-weight: 500;
          color: #e2e8f0; margin-bottom: 3px; margin-top: 5px;
        }
        .step-body p { font-size: 12px; color: #64748b; line-height: 1.55; }
        .step-badge {
          display: inline-block; font-size: 10px; color: #34d399;
          background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2);
          border-radius: 4px; padding: 1px 7px; margin-left: 6px;
          vertical-align: middle;
        }

        /* 收益预览条 */
        .reward-bar {
          background: rgba(99,179,237,0.06); border: 1px solid rgba(99,179,237,0.12);
          border-radius: 12px; padding: 16px 20px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .reward-bar-left { font-size: 12px; color: #64748b; }
        .reward-bar-left strong { display: block; font-size: 20px; font-weight: 700; color: #63b3ed; line-height: 1.2; margin-bottom: 2px; }
        .unlock-bar { margin-top: 10px; }
        .unlock-label { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 6px; }
        .unlock-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .unlock-fill  { height: 100%; width: 60%; background: linear-gradient(90deg, #63b3ed, #8b5cf6); border-radius: 2px; }
        .reward-bar-right { text-align: right; }
        .reward-bar-right small { font-size: 11px; color: #475569; display: block; margin-bottom: 4px; }
        .reward-bar-right span { font-size: 13px; color: #34d399; font-weight: 500; }

        /* ── Footer ── */
        footer {
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 11px; color: #475569;
        }
        footer a { color: #475569; text-decoration: none; transition: color 0.2s; }
        footer a:hover { color: #94a3b8; }
        .foot-links { display: flex; gap: 24px; }

        @media (max-width: 900px) {
          html, body { overflow: auto; }
          .page { grid-template-rows: auto; height: auto; padding: 24px; }
          main { grid-template-columns: 1fr; gap: 40px; }
          .bg-ring, .bg-glow { display: none; }
        }
      `}</style>

      <div className='bg'>
        <div className='bg-glow' />
        <div className='bg-ring bg-ring-1' />
        <div className='bg-ring bg-ring-2' />
      </div>

      <div className='page'>
        {/* NAV */}
        <nav>
          <div className='brand'>
            Permit<span>Vault</span>
          </div>
          <div className='status'>
            <span className='dot' />
            本地网络运行中
          </div>
        </nav>

        {/* MAIN */}
        <main>
          {/* 左：价值主张 */}
          <div className='left'>
            <div className='tag'>
              <span className='tag-dot' />
              链上质押协议
            </div>

            <h1>
              质押资产，
              <br />
              <span className='sub'>坐等</span>
              <span className='hl'>收益</span>
              <br />
              <span className='sub'>自动到账。</span>
            </h1>

            <p className='desc'>存入 ETH 或代币，系统每秒自动为你积累奖励。 无需反复授权，一次签名永久生效。</p>

            <div className='values'>
              <div className='value'>
                <div className='value-icon blue'>⚡</div>
                <div className='value-text'>
                  <strong>一次授权，永久存款</strong>
                  <span>首次设置后，之后每次存款只需在钱包确认签名，无额外操作。</span>
                </div>
              </div>
              <div className='value'>
                <div className='value-icon purple'>🔒</div>
                <div className='value-text'>
                  <strong>奖励分批解锁，收益有保障</strong>
                  <span>奖励按时间线性释放，协议设计防止短期套利砸盘，长期持有更有利。</span>
                </div>
              </div>
              <div className='value'>
                <div className='value-icon green'>↩</div>
                <div className='value-text'>
                  <strong>随时提取本金</strong>
                  <span>质押的 ETH 和代币随时可取回，没有强制锁仓周期。</span>
                </div>
              </div>
            </div>

            <Link href='/permit-vault' className='cta'>
              开始质押
              <span className='cta-arrow'>→</span>
            </Link>
          </div>

          {/* 右：操作流程卡片 */}
          <div className='card'>
            <div className='card-title'>三步开始赚取收益</div>

            <div className='steps'>
              <div className='step'>
                <div className='step-line' />
                <div className='step-num'>1</div>
                <div className='step-body'>
                  <strong>连接钱包 · 一键授权</strong>
                  <p>连接 MetaMask 等钱包，对协议进行一次性授权。之后永远不需要重复这步。</p>
                </div>
              </div>
              <div className='step'>
                <div className='step-line' />
                <div className='step-num'>2</div>
                <div className='step-body'>
                  <strong>
                    存入资产
                    <span className='step-badge'>免 Gas 签名</span>
                  </strong>
                  <p>输入金额，在钱包弹窗确认签名即可。无需支付额外授权手续费。</p>
                </div>
              </div>
              <div className='step'>
                <div className='step-line' />
                <div className='step-num'>3</div>
                <div className='step-body'>
                  <strong>等待解锁，按时领取</strong>
                  <p>奖励实时积累，锁定期结束后按比例逐步释放，随时可领取已解锁部分。</p>
                </div>
              </div>
            </div>

            {/* 示意收益条 */}
            <div className='reward-bar'>
              <div className='reward-bar-left'>
                <strong>+ 12.48 RDT</strong>
                <span>本轮累计奖励</span>
                <div className='unlock-bar'>
                  <div className='unlock-label'>
                    <span>解锁进度</span>
                    <span>60%</span>
                  </div>
                  <div className='unlock-track'>
                    <div className='unlock-fill' />
                  </div>
                </div>
              </div>
              <div className='reward-bar-right'>
                <small>当前可领取</small>
                <span>7.49 RDT</span>
              </div>
            </div>
          </div>
        </main>

        {/* FOOTER */}
        <footer>
          <span>PermitVault · MIT License</span>
          <div className='foot-links'>
            <a href='https://github.com' target='_blank' rel='noreferrer'>
              GitHub
            </a>
            <a href='/permit-vault'>进入应用</a>
          </div>
        </footer>
      </div>
    </>
  );
}
