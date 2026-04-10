// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PermitERC20
 * @dev 支持 EIP-2612 Permit 的 ERC20 测试代币
 *
 * 用途：
 * - 作为 PermitVault 的质押代币（stakeToken）
 * - 用户通过 signTypedData 签名 Permit，
 *   随后 PermitVault 调用 Permit2.permitTransferFrom 完成授权 + 转账原子操作
 *
 * 为什么用 ERC20Permit 而不是自实现：
 * - OZ ERC20Permit 已包含 nonces、DOMAIN_SEPARATOR、permit() 等完整实现
 * - 与 Permit2 完全兼容（Permit2 只需要标准 ERC20 approve，不依赖 ERC20Permit）
 */
contract PermitERC20 is ERC20Permit, Ownable {

    constructor(string memory tokenName, string memory tokenSymbol)
        ERC20(tokenName, tokenSymbol)
        ERC20Permit(tokenName)
        Ownable(msg.sender)
    {}

    /// @notice 铸造代币，仅 owner 可调用（部署脚本用于给测试账户发币）
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
