// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import 'forge-std/Script.sol';
import '../src/PermitERC20.sol';
import '../src/RebaseToken.sol';
import '../src/PermitVault.sol';

/**
 * @dev 一键部署全套合约：Permit2 → StakeToken → RewardToken → PermitVault
 *
 * 前置条件：
 *   1. anvil 正在运行
 *   2. 已执行 make permit2（生成 permit2.bytecode）
 *   3. 根目录 .env 包含 PRIVATE_KEY
 *
 * 部署后，把输出的 4 个地址填入 .env.local
 */
contract PermitVaultScript is Script {
  function run() external {
    uint256 pk = vm.envUint('PRIVATE_KEY');
    address deployer = vm.addr(pk);

    vm.startBroadcast(pk);

    // 1. 部署 Permit2（字节码方式）
    bytes memory permit2Bytecode = vm.readFileBinary('permit2.bytecode');
    require(permit2Bytecode.length > 0, 'permit2.bytecode not found, run: make permit2');
    address permit2Addr;
    assembly {
      permit2Addr := create(0, add(permit2Bytecode, 0x20), mload(permit2Bytecode))
    }
    require(permit2Addr != address(0), 'Permit2 deploy failed');

    // 2. 部署质押代币（EIP-2612 Permit + 标准 ERC20）
    PermitERC20 stakeToken = new PermitERC20('Stake Token', 'STK');

    // 3. 部署奖励代币（Rebase + 按需 mint）
    RebaseToken rewardToken = new RebaseToken();

    // 4. 部署主合约
    //    rewardRate = 1e15：每秒每单位质押产生 0.001 RDT 奖励（本地演示用）
    PermitVault vault = new PermitVault(permit2Addr, address(stakeToken), address(rewardToken), 1e15);

    // 5. 将 RebaseToken 的 mint 权限移交给 vault
    rewardToken.transferOwnership(address(vault));

    // 6. 给 deployer 铸造测试用质押代币
    stakeToken.mint(deployer, 100_000 ether);

    vm.stopBroadcast();

    // 输出部署地址（填入 .env.local）
    console.log(unicode'=== 部署完成，将以下地址填入 .env.local ===');
    console.log('NEXT_PUBLIC_PERMIT2_ADDRESS     =', permit2Addr);
    console.log('NEXT_PUBLIC_VAULT_ADDRESS       =', address(vault));
    console.log('NEXT_PUBLIC_STAKE_TOKEN_ADDRESS =', address(stakeToken));
    console.log('NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=', address(rewardToken));
  }
}
