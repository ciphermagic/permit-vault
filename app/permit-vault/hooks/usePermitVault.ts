'use client';

import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { parseEther, type Address } from 'viem';

import PermitVaultAbi from '@/abis/PermitVault.json';

const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;

export function usePermitVault() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const stakeInfo = useReadContract({
    address: VAULT_ADDRESS,
    abi: PermitVaultAbi,
    functionName: 'getStakeInfo',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      // 每 5 秒轮询一次：进度条、奖励累计、可领取量均依赖 block.timestamp，必须持续刷新
      // 本地测试用短周期（5s），生产环境可改为 15000（约一个区块时间）
      refetchInterval: 5_000,
    },
  });

  const depositETH = async (amount: string) => {
    return writeContractAsync({
      address: VAULT_ADDRESS,
      abi: PermitVaultAbi,
      functionName: 'depositETH',
      value: parseEther(amount),
    });
  };

  // 合约签名：depositWithPermit2(uint256 amount, uint256 nonce, uint256 deadline, bytes signature)
  // 注意：合约内部固定使用 stakeToken，不需要传 token 地址
  const depositWithPermit2 = async (
    amount: string,
    nonce: bigint,
    deadline: bigint,
    signature: `0x${string}`,
  ) => {
    return writeContractAsync({
      address: VAULT_ADDRESS,
      abi: PermitVaultAbi,
      functionName: 'depositWithPermit2',
      args: [parseEther(amount), nonce, deadline, signature],
    });
  };

  const claimReward = async () => {
    return writeContractAsync({
      address: VAULT_ADDRESS,
      abi: PermitVaultAbi,
      functionName: 'claimReward',
    });
  };

  const withdraw = async (token: Address, amount: string) => {
    return writeContractAsync({
      address: VAULT_ADDRESS,
      abi: PermitVaultAbi,
      functionName: 'withdraw',
      args: [token, parseEther(amount)],
    });
  };

  return {
    vaultAddress: VAULT_ADDRESS,
    address,
    isPending,
    stakeInfo,
    depositETH,
    depositWithPermit2,
    claimReward,
    withdraw,
  };
}