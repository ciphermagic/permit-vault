include .env
export

## ── 依赖安装 ──────────────────────────────────────────────
install:
	forge install OpenZeppelin/openzeppelin-contracts --no-git
	forge install foundry-rs/forge-std --no-git
	forge install Uniswap/permit2 --no-git
	forge install transmissions11/solmate --no-git

permit2:
	FOUNDRY_PROFILE=permit2 forge build
	python3 -c "\
import json; \
d = json.load(open('out-permit2/Permit2.sol/Permit2.json')); \
b = d['bytecode']['object']; \
b = b[2:] if b.startswith('0x') else b; \
open('permit2.bytecode', 'wb').write(bytes.fromhex(b)); \
print('permit2.bytecode written,', len(b)//2, 'bytes')"

abis:
	forge inspect PermitVault abi --json > ../abis/PermitVault.json
	forge inspect PermitERC20 abi --json > ../abis/PermitERC20.json
	forge inspect RebaseToken abi --json > ../abis/RebaseToken.json

build: 
	forge build
	$(MAKE) abis

deploy-local:
	forge script script/PermitVault.s.sol:PermitVaultScript \
		--rpc-url http://127.0.0.1:8545 \
		--private-key $$PRIVATE_KEY \
		--broadcast

.PHONY: permit2 build deploy-local