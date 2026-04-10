// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ISignatureTransfer } from 'permit2/interfaces/ISignatureTransfer.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { ReentrancyGuard } from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './RebaseToken.sol';

/**
 * @title PermitVault
 * @dev 无 Gas 授权的链上收益质押协议
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     核心设计概述                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │  1. 存款授权（Permit2 SignatureTransfer）                    │
 * │     用户对 Permit2 合约做一次性 approve(max)，后续每次存款    │
 * │     通过链下 EIP-712 签名完成，签名不上链、不花 Gas。         │
 * │     Permit2 在执行时原子完成：验签 + nonce 消耗 + transfer。  │
 * │                                                             │
 * │  2. 收益计算（Synthetix rewardPerTokenStored 快照算法）       │
 * │     全局维护 rewardPerTokenStored 累计值，用户领取时          │
 * │     只需计算 stake × (当前快照 - 用户上次快照) / 1e18，       │
 * │     复杂度 O(1)，不随质押人数增长。                          │
 * │                                                             │
 * │  3. 奖励释放（单轮 Cliff + Linear Vesting）                  │
 * │     首次质押时 vestingStart 自动打点，Cliff 开始倒计时。       │
 * │     Cliff 结束后奖励按时间线性释放，VEST_PERIOD 走完后         │
 * │     后续所有新增收益均可立即领取，不再开启新一轮。             │
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 奖励时间轴（本地测试参数）：
 *
 *   首次质押
 *      │
 *      │←── Cliff（1 分钟，完全锁定）──→│←── 线性释放（2 分钟）──→│── 全额可领
 *      │    releasable = 0              │  releasable 线性增长    │  releasable = totalEarned
 *      │    claimReward() 会 revert     │  可随时部分领取          │  后续新增收益立即可领
 *
 * 上线时将 CLIFF / VEST_PERIOD 改为 30 days / 60 days。
 */
contract PermitVault is Ownable, ReentrancyGuard {
  // ────────────────────────────────────────────────────────────
  // 不可变状态变量（部署后永不改变）
  // ────────────────────────────────────────────────────────────

  /// @notice Permit2 合约实例，负责验签 + 原子 transferFrom
  ISignatureTransfer public immutable permit2;

  /// @notice 质押代币（ERC20），用户存入此代币赚取奖励
  IERC20 public immutable stakeToken;

  /// @notice 奖励代币（RebaseToken），由本合约按需 mint，无预挖
  RebaseToken public immutable rewardToken;

  // ────────────────────────────────────────────────────────────
  // 收益快照状态（Synthetix rewardPerTokenStored 模式）
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 每秒每单位质押量分配的奖励速率（wei/s）
   * @dev    由 owner 通过 setRewardRate() 调整
   *         例：rewardRate = 1e15 表示每秒全池分配 0.001 个奖励代币
   */
  uint256 public rewardRate;

  /**
   * @notice 全局累计"每单位质押量已分配奖励"快照（精度 1e18）
   * @dev    每次有质押量变动或用户交互时更新。
   *         用户奖励 = stake × (rewardPerTokenStored - userRewardPerTokenPaid[user]) / 1e18
   *         这是 Synthetix 快照算法的核心，确保 O(1) 计算任意用户收益。
   */
  uint256 public rewardPerTokenStored;

  /**
   * @notice 上次更新 rewardPerTokenStored 的时间戳
   * @dev    用于计算从上次更新到当前时间段内新增的 rewardPerToken
   */
  uint256 public lastUpdateTime;

  /**
   * @notice 全局总质押量（ETH + ERC20 质押的 wei 总和）
   * @dev    作为分母参与 rewardPerToken 计算，totalStaked = 0 时停止分发
   */
  uint256 public totalStaked;

  /**
   * @notice 每个用户上次结算时的 rewardPerTokenStored 快照
   * @dev    用于计算用户上次结算后新增的奖励：
   *         新增奖励 = stake × (当前快照 - 用户快照) / 1e18
   */
  mapping(address => uint256) public userRewardPerTokenPaid;

  /**
   * @notice 每个用户已累积但尚未进入 Vesting 结算的待领奖励
   * @dev    每次 updateReward modifier 运行时刷新。
   *         注意：这是快照值，两笔交易之间实时增长的奖励未反映在此，
   *         需调用 _earned() 获取含实时增量的完整值。
   */
  mapping(address => uint256) public pendingRewards;

  // ────────────────────────────────────────────────────────────
  // 质押记录
  // ────────────────────────────────────────────────────────────

  /// @notice 每个用户的 ETH 质押量（wei）
  mapping(address => uint256) public ethStakes;

  /**
   * @notice 每个用户每种 ERC20 代币的质押量
   * @dev    tokenStakes[user][tokenAddress] = 质押量（wei）
   *         目前只支持 stakeToken，预留结构以便未来扩展多币种
   */
  mapping(address => mapping(address => uint256)) public tokenStakes;

  /**
   * @notice 每个用户首次质押的时间戳
   * @dev    同时也是 vestingStart 的打点时机，二者在首次质押时一并设置。
   *         用于前端展示"质押时间"。
   */
  mapping(address => uint256) public stakeTimestamp;

  // ────────────────────────────────────────────────────────────
  // Vesting 状态
  //
  // 单轮设计说明：
  //   本合约采用"单轮永久 Vesting"模型，而非多轮循环：
  //   - vestingStart 在首次质押时打点，此后永不重置
  //   - CLIFF 期间无法领取任何奖励
  //   - CLIFF 后线性释放直到 VEST_PERIOD 走完
  //   - VEST_PERIOD 走完后，所有历史和新增奖励均可立即领取
  //   - 不存在"第二轮 Cliff"，用户无需反复等待锁定期
  // ────────────────────────────────────────────────────────────

  /**
   * @notice Cliff 锁定期时长
   * @dev    本地测试设为 1 分钟，上线应改为 30 days。
   *         在此期间调用 claimReward() 会 revert StillInCliff。
   */
  uint256 public constant CLIFF = 1 minutes;

  /**
   * @notice 线性释放总时长（Cliff 结束后开始计时）
   * @dev    本地测试设为 2 分钟，上线应改为 60 days。
   *         elapsed / VEST_PERIOD 决定当前可释放比例。
   */
  uint256 public constant VEST_PERIOD = 2 minutes;

  /**
   * @notice 每个用户的 Vesting 起始时间戳
   * @dev    在首次质押（depositETH 或 depositWithPermit2）时自动设置为 block.timestamp。
   *         Cliff 从此刻开始倒计时：block.timestamp >= vestingStart + CLIFF 才可领取。
   *         单轮模式下此值一旦设置就不再重置。
   */
  mapping(address => uint256) public vestingStart;

  /**
   * @notice 保留变量（单轮模式下不再作为核心状态使用）
   * @dev    历史版本中用于记录"已移入 Vesting 计划的总量"。
   *         当前版本改为直接从 pendingRewards 读取，此变量保留
   *         是为了避免破坏已部署合约的 ABI 和前端依赖。
   */
  mapping(address => uint256) public totalVested;

  /**
   * @notice 每个用户累计已从 Vesting 中领取的奖励总量
   * @dev    每次 claimReward() 成功执行后递增：claimed[user] += releasable。
   *         用于计算剩余可领取量：releasable = vested - claimed[user]。
   *         终身累计，不重置。
   */
  mapping(address => uint256) public claimed;

  // ────────────────────────────────────────────────────────────
  // 自定义错误（比 require string 更省 Gas）
  // ────────────────────────────────────────────────────────────

  /// @notice 无可领取奖励（Cliff 已过但线性释放量为 0，或尚未质押）
  error NothingToClaim();

  /**
   * @notice 仍在 Cliff 锁定期内
   * @param unlocksAt Cliff 结束的精确时间戳，前端可用于倒计时展示
   */
  error StillInCliff(uint256 unlocksAt);

  // ────────────────────────────────────────────────────────────
  // 事件
  // ────────────────────────────────────────────────────────────

  /// @notice 用户成功存款时触发
  /// @param token address(0) 表示 ETH，否则为 ERC20 地址
  event Deposited(address indexed user, address indexed token, uint256 amount);

  /// @notice 用户成功领取奖励时触发
  event RewardClaimed(address indexed user, uint256 amount);

  /// @notice 首次质押时 Vesting 计时开始
  /// @dev    amount 为 0（此时尚未产生奖励），仅作为计时起点的记录
  event VestingStarted(address indexed user, uint256 amount);

  /// @notice 用户成功提取本金时触发
  /// @param token address(0) 表示 ETH
  event Withdrawn(address indexed user, address indexed token, uint256 amount);

  /// @notice owner 更新奖励速率时触发
  event RewardRateUpdated(uint256 newRate);

  // ────────────────────────────────────────────────────────────
  // 构造函数
  // ────────────────────────────────────────────────────────────

  /**
   * @param _permit2     Permit2 合约地址（本地 anvil 通过字节码自部署，行为与主网一致）
   * @param _stakeToken  质押代币地址（PermitERC20，支持 EIP-2612）
   * @param _rewardToken 奖励代币地址（RebaseToken，由本合约 mint）
   * @param _rewardRate  初始奖励速率（wei/s），可通过 setRewardRate 调整
   */
  constructor(address _permit2, address _stakeToken, address _rewardToken, uint256 _rewardRate) Ownable(msg.sender) {
    permit2 = ISignatureTransfer(_permit2);
    stakeToken = IERC20(_stakeToken);
    rewardToken = RebaseToken(_rewardToken);
    rewardRate = _rewardRate;
    lastUpdateTime = block.timestamp;
  }

  // ────────────────────────────────────────────────────────────
  // 收益快照 Modifier
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 在每次状态变更前刷新全局快照和用户待领奖励
   * @dev    执行顺序：
   *           1. 更新 rewardPerTokenStored（累加从 lastUpdateTime 到 now 的增量）
   *           2. 更新 lastUpdateTime = now
   *           3. 若 user != address(0)，将用户实时奖励写入 pendingRewards
   *              并更新 userRewardPerTokenPaid（防止重复计算）
   *           4. 执行被修饰的函数体
   *
   *         user 传 address(0) 仅用于更新全局快照而不结算任何用户
   *         （例如 setRewardRate 调用时）。
   */
  modifier updateReward(address user) {
    rewardPerTokenStored = _rewardPerToken();
    lastUpdateTime = block.timestamp;

    if (user != address(0)) {
      // 将用户从上次快照到当前的所有新增奖励写入 pendingRewards
      pendingRewards[user] = _earned(user);
      // 记录本次结算时的快照，防止下次计算时重复累加
      userRewardPerTokenPaid[user] = rewardPerTokenStored;
    }
    _;
  }

  /**
   * @notice 计算当前"每单位质押量的累计奖励"
   * @dev    公式：rewardPerTokenStored + rewardRate × Δt × 1e18 / totalStaked
   *         乘以 1e18 是为了保留精度，后续除以 1e18 还原实际值。
   *         totalStaked = 0 时直接返回存量，避免除零。
   */
  function _rewardPerToken() internal view returns (uint256) {
    if (totalStaked == 0) return rewardPerTokenStored;
    return rewardPerTokenStored + (rewardRate * (block.timestamp - lastUpdateTime) * 1e18) / totalStaked;
  }

  /**
   * @notice 计算用户从上次快照到当前时刻的全部累计奖励（含实时增量）
   * @dev    公式：stake × (当前快照 - 用户上次快照) / 1e18 + pendingRewards[user]
   *
   *         注意：pendingRewards 是上次 updateReward 时的快照，
   *         两笔交易之间新增的奖励在 _rewardPerToken() 中实时计算并累加。
   *         每次调用 _earned 都能得到当前时刻的精确值。
   */
  function _earned(address user) internal view returns (uint256) {
    uint256 stake = ethStakes[user] + tokenStakes[user][address(stakeToken)];
    return (stake * (_rewardPerToken() - userRewardPerTokenPaid[user])) / 1e18 + pendingRewards[user];
  }

  // ────────────────────────────────────────────────────────────
  // 存款
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 直接质押 ETH
   * @dev    ETH 随 msg.value 传入，无需 approve。
   *         updateReward 先于余额增加执行，确保新质押量不会影响历史收益计算。
   *         首次质押同时打点 stakeTimestamp 和 vestingStart，启动 Cliff 倒计时。
   */
  function depositETH() external payable updateReward(msg.sender) {
    require(msg.value > 0, 'zero amount');

    ethStakes[msg.sender] += msg.value;
    totalStaked += msg.value;

    // 首次质押：记录时间戳并启动唯一一轮 Vesting 计时
    // 注：若用户已有 ERC20 质押记录（stakeTimestamp != 0），不重置 vestingStart
    if (stakeTimestamp[msg.sender] == 0) {
      stakeTimestamp[msg.sender] = block.timestamp;
      vestingStart[msg.sender] = block.timestamp;
      emit VestingStarted(msg.sender, 0);
    }

    emit Deposited(msg.sender, address(0), msg.value);
  }

  /**
   * @notice 通过 Permit2 SignatureTransfer 完成 ERC20 授权 + 存款（原子操作）
   *
   * @dev    前置条件：用户已对 Permit2 合约执行一次性 approve(stakeToken, max)。
   *
   *         签名结构（前端用 viem buildPermit2TypedData 构造）：
   *           domain: { name: "Permit2", chainId, verifyingContract: permit2Address }
   *           primaryType: "PermitTransferFrom"
   *           types:
   *             PermitTransferFrom: [permitted(TokenPermissions), spender, nonce, deadline]
   *             TokenPermissions:   [token, amount]
   *           message:
   *             permitted: { token: stakeToken, amount }
   *             spender:   address(this)     ← PermitVault 地址
   *             nonce:     随机 uint256       ← 前端每次随机生成，bitmap 防重放
   *             deadline:  block.timestamp + 3600
   *
   *         Permit2 内部原子执行：
   *           1. 验证 EIP-712 签名
   *           2. 标记 nonce 已使用（bitmap，防重放攻击）
   *           3. 调用 stakeToken.transferFrom(user → vault, amount)
   *
   * @param amount    存款金额（wei），必须与签名中的 permitted.amount 一致
   * @param nonce     随机 uint256，Permit2 bitmap 确保同一 nonce 只能使用一次
   * @param deadline  签名过期时间戳，超时后 Permit2 拒绝执行
   * @param signature 用户对 PermitTransferFrom 结构体的 EIP-712 签名
   */
  function depositWithPermit2(
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
  ) external updateReward(msg.sender) {
    require(amount > 0, 'zero amount');

    // 构造 Permit2 授权结构体
    ISignatureTransfer.PermitTransferFrom memory permitMsg = ISignatureTransfer.PermitTransferFrom({
      permitted: ISignatureTransfer.TokenPermissions({ token: address(stakeToken), amount: amount }),
      nonce: nonce,
      deadline: deadline
    });

    // 指定转账目标：从用户转入本合约
    ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
      to: address(this),
      requestedAmount: amount
    });

    // Permit2 原子完成：验签 + 消耗 nonce + transferFrom
    permit2.permitTransferFrom(permitMsg, transferDetails, msg.sender, signature);

    tokenStakes[msg.sender][address(stakeToken)] += amount;
    totalStaked += amount;

    // 首次质押：自动启动唯一一轮 Vesting 计时
    if (stakeTimestamp[msg.sender] == 0) {
      stakeTimestamp[msg.sender] = block.timestamp;
      vestingStart[msg.sender] = block.timestamp;
      emit VestingStarted(msg.sender, 0);
    }

    emit Deposited(msg.sender, address(stakeToken), amount);
  }

  // ────────────────────────────────────────────────────────────
  // 奖励领取
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 领取当前已线性释放的奖励（mint RebaseToken 给调用者）
   *
   * @dev    执行流程：
   *           1. updateReward 先刷新 pendingRewards（确保含最新增量）
   *           2. 检查 vestingStart 是否已设置（未质押则 revert）
   *           3. 检查 Cliff 是否已过（未过则 revert StillInCliff）
   *           4. 调用 _releasable 计算当前可领取量
   *           5. 累加 claimed，mint 对应数量 RDT 给用户
   *
   *         可多次部分领取：每次领走当前可领取量，
   *         随时间推移 releasable 继续增加，可再次调用。
   *
   *         VEST_PERIOD 走完后，所有历史 + 新增奖励均可立即领取，
   *         不再有任何时间限制，不开启新一轮 Cliff。
   *
   *         nonReentrant 防止通过 RebaseToken mint 回调重入。
   */
  function claimReward() external updateReward(msg.sender) nonReentrant {
    uint256 start = vestingStart[msg.sender];
    // 用户从未质押，没有 Vesting 起点
    if (start == 0) revert NothingToClaim();

    // Cliff 期间无法领取，revert 并返回解锁时间戳供前端展示倒计时
    uint256 unlocksAt = start + CLIFF;
    if (block.timestamp < unlocksAt) revert StillInCliff(unlocksAt);

    uint256 releasable = _releasable(msg.sender);
    if (releasable == 0) revert NothingToClaim();

    // 先更新 claimed 再 mint，遵循 Checks-Effects-Interactions 模式
    claimed[msg.sender] += releasable;
    rewardToken.mint(msg.sender, releasable);

    emit RewardClaimed(msg.sender, releasable);
  }

  /**
   * @notice 计算用户当前可从 Vesting 计划中领取的奖励量
   * @dev    依赖 pendingRewards（快照值），调用前须由 updateReward 刷新，
   *         否则可能低估实际可领取量（两笔交易间的新增收益未反映）。
   *         claimReward() 带 updateReward modifier，因此实际执行时值是准确的。
   *
   *         计算逻辑：
   *           totalEarned = pendingRewards[user]（当前全部累计奖励）
   *           elapsed     = now - (vestingStart + CLIFF)
   *
   *           if elapsed >= VEST_PERIOD:
   *             vested = totalEarned（全部解锁，含历史所有积累）
   *           else:
   *             vested = totalEarned × elapsed / VEST_PERIOD（按比例线性释放）
   *
   *           releasable = vested - claimed[user]（减去已领取部分）
   */
  function _releasable(address user) internal view returns (uint256) {
    uint256 start = vestingStart[user];
    if (start == 0) return 0;
    if (block.timestamp < start + CLIFF) return 0;

    // 用户全部累计奖励（已由 updateReward 刷新的快照值）
    uint256 totalEarned = pendingRewards[user];
    // Cliff 结束后已经过去的时间
    uint256 elapsed = block.timestamp - (start + CLIFF);

    uint256 vested;
    if (elapsed >= VEST_PERIOD) {
      // 线性释放期已走完：全部奖励解锁，后续新增奖励也立即可领
      vested = totalEarned;
    } else {
      // 线性释放期进行中：按 elapsed / VEST_PERIOD 比例解锁
      vested = (totalEarned * elapsed) / VEST_PERIOD;
    }

    // 减去已领取量，得到本次可领取的净增量
    if (vested <= claimed[user]) return 0;
    return vested - claimed[user];
  }

  // ────────────────────────────────────────────────────────────
  // 提款
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 提取质押的本金（ETH 或 ERC20），不影响已积累的奖励
   * @dev    执行顺序（顺序至关重要）：
   *           1. updateReward：先快照当前奖励，防止余额减少影响历史收益计算
   *           2. 减少质押余额和 totalStaked
   *           3. 转账给用户
   *
   *         提款后影响：
   *           - 历史 pendingRewards 完整保留，不受影响
   *           - 未来收益速率按新余额等比例降低
   *           - Vesting 进度（vestingStart、claimed）完全不变
   *           - 全部提走后停止积累新奖励，但已有奖励仍可按 Vesting 计划领取
   *
   *         nonReentrant：ETH 转账使用 call，防止接收方合约回调重入。
   *
   * @param token   address(0) 表示提取 ETH，否则为 ERC20 代币地址（目前仅支持 stakeToken）
   * @param amount  提取数量（wei）
   */
  function withdraw(address token, uint256 amount) external nonReentrant updateReward(msg.sender) {
    if (token == address(0)) {
      // ── 提取 ETH ──
      require(ethStakes[msg.sender] >= amount, 'insufficient ETH');

      ethStakes[msg.sender] -= amount;
      totalStaked -= amount;

      // 使用 call 而非 transfer，避免 gas stipend 限制导致失败
      (bool ok, ) = msg.sender.call{ value: amount }('');
      require(ok, 'ETH transfer failed');
    } else {
      // ── 提取 ERC20 ──
      require(token == address(stakeToken), 'unsupported token');
      require(tokenStakes[msg.sender][token] >= amount, 'insufficient token');

      tokenStakes[msg.sender][token] -= amount;
      totalStaked -= amount;

      bool ok = IERC20(token).transfer(msg.sender, amount);
      require(ok, 'token transfer failed');
    }

    emit Withdrawn(msg.sender, token, amount);
  }

  // ────────────────────────────────────────────────────────────
  // 查询（view 函数，不消耗 Gas）
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 查询用户的质押与收益综合信息，前端主要数据来源
   * @dev    返回值语义：
   *
   *           ethStaked        用户当前 ETH 质押量（wei）
   *           tokenStakedAmount 用户当前 ERC20 质押量（wei）
   *           earned           用户当前全部累计奖励（实时值，含快照外新增）
   *           releasable       当前可领取量（已过 Cliff 且未领部分）
   *           vestedTotal      等同于 earned（单轮模式下无独立 vesting 账本）
   *           alreadyClaimed   历史累计已领取量
   *           lockProgress     线性释放进度 0–100（Cliff 期间为 0，走完为 100）
   *
   *         注意：earned 使用 _earned(user) 计算实时值，
   *         releasable 也基于 earned 而非 pendingRewards 快照，
   *         因此前端展示与链上实际执行结果一致。
   *
   * @param  user 查询地址
   */
  function getStakeInfo(
    address user
  )
    external
    view
    returns (
      uint256 ethStaked,
      uint256 tokenStakedAmount,
      uint256 earned,
      uint256 releasable,
      uint256 vestedTotal,
      uint256 alreadyClaimed,
      uint8 lockProgress
    )
  {
    ethStaked = ethStakes[user];
    tokenStakedAmount = tokenStakes[user][address(stakeToken)];
    earned = _earned(user); // 实时值，含快照外新增奖励
    alreadyClaimed = claimed[user];
    vestedTotal = earned; // 单轮模式下等同于 earned

    uint256 start = vestingStart[user];

    if (start != 0 && block.timestamp >= start + CLIFF) {
      uint256 elapsed = block.timestamp - (start + CLIFF);

      if (elapsed >= VEST_PERIOD) {
        // 线性释放期已结束：全部可领
        releasable = earned > alreadyClaimed ? earned - alreadyClaimed : 0;
        lockProgress = 100;
      } else {
        // 线性释放期进行中
        uint256 vested = (earned * elapsed) / VEST_PERIOD;
        releasable = vested > alreadyClaimed ? vested - alreadyClaimed : 0;
        lockProgress = uint8((elapsed * 100) / VEST_PERIOD);
      }
    } else {
      // 未质押 或 仍在 Cliff 期
      releasable = 0;
      lockProgress = 0;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Owner 管理
  // ────────────────────────────────────────────────────────────

  /**
   * @notice 更新每秒奖励速率
   * @dev    调用前先更新全局快照（updateReward(address(0))），
   *         确保速率变更前后的收益分别按各自速率计算，不会串扰。
   *         例：旧速率 1e15，新速率 2e15，变更时刻之前按 1e15 结算，之后按 2e15 结算。
   * @param  newRate 新的奖励速率（wei/s）
   */
  function setRewardRate(uint256 newRate) external onlyOwner updateReward(address(0)) {
    rewardRate = newRate;
    emit RewardRateUpdated(newRate);
  }
}
