import type { Address } from 'viem';

/**
 * 构造 Permit2 SignatureTransfer 的 EIP-712 typed data
 *
 * 注意：这与 EIP-2612 (token.permit) 是完全不同的两套结构：
 *
 * EIP-2612:
 *   domain.verifyingContract = token 地址
 *   types: { Permit: [owner, spender, value, nonce, deadline] }
 *
 * Permit2 SignatureTransfer（本函数）:
 *   domain.verifyingContract = Permit2 合约地址
 *   types: { PermitTransferFrom + TokenPermissions }
 *   message.permitted = { token, amount }（嵌套结构）
 */
export function buildPermit2TypedData(
  token: Address,
  amount: bigint,
  spender: Address,
  nonce: bigint,
  deadline: bigint,
  owner: Address,
  chainId: number,
  permit2Address: Address,
) {
  return {
    domain: {
      name: 'Permit2', // Permit2 合约固定使用这个 name
      chainId,
      verifyingContract: permit2Address, // 指向 Permit2 合约，而非 token
    },
    types: {
      // Permit2 SignatureTransfer 的两层嵌套类型
      PermitTransferFrom: [
        { name: 'permitted', type: 'TokenPermissions' },
        { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
      TokenPermissions: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    },
    primaryType: 'PermitTransferFrom' as const,
    message: {
      permitted: {
        token, // 授权转移的代币地址
        amount, // 授权金额
      },
      spender, // 被授权方（PermitVault 合约地址）
      nonce, // 随机 uint256，bitmap 防重放
      deadline, // 签名过期时间戳
    },
  };
}
