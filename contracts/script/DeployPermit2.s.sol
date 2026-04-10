// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import 'forge-std/Script.sol';

/**
 * @dev 通过预编译字节码在本地部署 Permit2
 *
 * 为什么不直接 import Permit2.sol：
 *   Permit2 源码锁定 =0.8.17，与主项目 0.8.34 版本冲突，无法混编。
 *
 * 方案：用独立 profile 预编译，部署时读取产物字节码。
 *
 * 使用方式（只需执行一次预编译）：
 *   forge build --profile permit2
 *   （生成 out-permit2/Permit2.sol/Permit2.json）
 *
 * 然后正常部署：
 *   forge script script/DeployPermit2.s.sol --rpc-url $RPC_URL --broadcast
 */
contract DeployPermit2Script is Script {
  function run() external returns (address permit2Addr) {
    vm.startBroadcast(vm.envUint('PRIVATE_KEY'));

    // 从 permit2 profile 编译产物中读取字节码
    // 注意：需要先执行 forge build --profile permit2
    bytes memory bytecode = vm.readFileBinary('permit2.bytecode');
    require(bytecode.length > 0, 'permit2.bytecode not found, run: make permit2');

    assembly {
      permit2Addr := create(0, add(bytecode, 0x20), mload(bytecode))
    }
    require(permit2Addr != address(0), 'Permit2 deploy failed');

    vm.stopBroadcast();
    console.log('Permit2:', permit2Addr);
  }
}
