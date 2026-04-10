// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import 'forge-std/Script.sol';
import '../src/PermitERC20.sol';
import '../src/RebaseToken.sol';
import '../src/PermitVault.sol';

/**
forge script script/DeploySepolia.s.sol:DeploySepoliaScript \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
 */
contract DeploySepoliaScript is Script {
  address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

  function run() external {
    uint256 pk = vm.envUint('PRIVATE_KEY');
    address deployer = vm.addr(pk);

    vm.startBroadcast(pk);

    PermitERC20 stakeToken = new PermitERC20('Stake Token', 'STK');
    RebaseToken rewardToken = new RebaseToken();
    PermitVault vault = new PermitVault(PERMIT2, address(stakeToken), address(rewardToken), 1e15);

    rewardToken.transferOwnership(address(vault));
    stakeToken.mint(deployer, 100_000 ether);

    vm.stopBroadcast();

    console.log('NEXT_PUBLIC_PERMIT2_ADDRESS     =', PERMIT2);
    console.log('NEXT_PUBLIC_VAULT_ADDRESS       =', address(vault));
    console.log('NEXT_PUBLIC_STAKE_TOKEN_ADDRESS =', address(stakeToken));
    console.log('NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=', address(rewardToken));
  }
}
