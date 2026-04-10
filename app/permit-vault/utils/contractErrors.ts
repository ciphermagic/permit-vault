/**
 * 合约错误解码工具
 *
 * 优先级：已知 selector → Error(string) → 用户拒绝 → 余额不足 → 通用兜底
 */

// 已知错误 selector → 人类可读提示
// selector = keccak256("ErrorName()") 前 4 字节的十六进制
const KNOWN_SELECTORS: Record<string, string> = {
  '0x815e1d64': '奖励仍在锁定期内，暂时无法领取',   // NothingToClaim()
  '0x8d919b75': 'Cliff 锁定期未结束，请等待后再领取',  // StillInCliff(uint256)
  '0x756688fe': '签名已过期，请重新操作',              // Permit2: SignatureExpired
  '0x8baa579f': '签名无效，请重新签名',                // Permit2: InvalidSigner
  '0xb90cdbb1': 'Nonce 已被使用，请重试',              // Permit2: InvalidNonce
  '0xddafbaef': '代币或金额不被允许',                  // Permit2: InvalidAmount
};

/**
 * 从任意 Error 对象中提取人类可读的中文提示
 */
export function parseContractError(err: unknown): string {
  if (!err || typeof err !== 'object') return '操作失败，请重试';

  const message: string =
    (err as { shortMessage?: string }).shortMessage ||
    (err as { message?: string }).message ||
    '';

  // 用户在钱包中拒绝签名
  if (
    message.includes('User rejected') ||
    message.includes('user rejected') ||
    message.includes('denied') ||
    message.includes('cancelled')
  ) {
    return '已取消操作';
  }

  // ETH 余额不足 gas
  if (message.includes('insufficient funds')) {
    return 'ETH 余额不足以支付 Gas 费';
  }

  // 尝试匹配已知 custom error selector
  // viem 会把 selector 放在 data 字段，或者直接出现在 message 里
  const data: string =
    (err as { data?: string }).data ||
    (err as { cause?: { data?: string } }).cause?.data ||
    '';

  const selectorMatch = (data || message).match(/0x[0-9a-fA-F]{8}/);
  if (selectorMatch) {
    const sel = selectorMatch[0].toLowerCase();
    if (KNOWN_SELECTORS[sel]) return KNOWN_SELECTORS[sel];
  }

  // 尝试提取 revert reason string（Error(string) ABI 编码）
  const revertMatch = message.match(/reverted with reason string '(.+?)'/);
  if (revertMatch) return revertMatch[1];

  const execMatch = message.match(/execution reverted: (.+?)(?:\n|$)/);
  if (execMatch && execMatch[1] !== 'custom error') return execMatch[1];

  // 网络/RPC 错误
  if (message.includes('network') || message.includes('RPC') || message.includes('timeout')) {
    return '网络异常，请检查连接后重试';
  }

  return '交易失败，请稍后重试';
}