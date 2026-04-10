// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RebaseToken
 * @dev 通缩型 Rebase 奖励代币
 */
contract RebaseToken {

    // ── 存储 ─────────────────────────────────────────────
    mapping(address => uint256) private _gonBalances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // ── 常量 ─────────────────────────────────────────────
    uint256 private constant MAX_UINT256             = ~uint256(0);
    uint256 private constant INITIAL_FRAGMENTS_SUPPLY = 100_000_000 * 10 ** 18;
    uint256 private constant TOTAL_GONS              = MAX_UINT256 - (MAX_UINT256 % INITIAL_FRAGMENTS_SUPPLY);

    /// @dev 固定初始转换比率，构造时不依赖 _totalSupply，避免 div by zero
    uint256 private constant INITIAL_GONS_PER_FRAGMENT = TOTAL_GONS / INITIAL_FRAGMENTS_SUPPLY;

    uint256 private constant DEFLATION_RATE   = 99;
    uint256 private constant RATE_DENOMINATOR = 100;
    uint256 private constant REBASE_INTERVAL  = 365 days;

    // ── ERC20 元数据 ──────────────────────────────────────
    string  public name     = "Rebase Deflation Token";
    string  public symbol   = "RDT";
    uint8   public decimals = 18;

    // ── 动态状态 ──────────────────────────────────────────
    uint256 private _totalSupply;      // 初始为 0，vault mint 后增长
    uint256 private _gonsPerFragment;
    uint256 public  lastRebaseTime;
    uint256 public  rebaseCount;
    address public  owner;

    // ── 事件 ─────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Rebase(uint256 indexed epoch, uint256 totalSupply);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── 构造函数 ──────────────────────────────────────────
    constructor() {
        owner            = msg.sender;
        _totalSupply     = 0;                      // 从零开始，vault 按需 mint
        _gonsPerFragment = INITIAL_GONS_PER_FRAGMENT; // 用常量初始化，不做除法
        lastRebaseTime   = block.timestamp;
        // 不向任何地址预分配代币
    }

    // ── ERC20 标准函数 ─────────────────────────────────────

    function totalSupply() public view returns (uint256) { return _totalSupply; }

    function balanceOf(address who) public view returns (uint256) {
        if (_gonsPerFragment == 0) return 0;
        return _gonBalances[who] / _gonsPerFragment;
    }

    function transfer(address to, uint256 value) public returns (bool) {
        require(to != address(0),    "Transfer to zero address");
        require(to != address(this), "Transfer to contract");
        uint256 gonValue = value * _gonsPerFragment;
        _gonBalances[msg.sender] -= gonValue;
        _gonBalances[to]         += gonValue;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function allowance(address owner_, address spender) public view returns (uint256) {
        return _allowances[owner_][spender];
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(to != address(0),    "Transfer to zero address");
        require(to != address(this), "Transfer to contract");
        _allowances[from][msg.sender] -= value;
        uint256 gonValue = value * _gonsPerFragment;
        _gonBalances[from] -= gonValue;
        _gonBalances[to]   += gonValue;
        emit Transfer(from, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        _allowances[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _allowances[msg.sender][spender] += addedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        uint256 oldValue = _allowances[msg.sender][spender];
        _allowances[msg.sender][spender] = subtractedValue >= oldValue ? 0 : oldValue - subtractedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    // ── 权限管理 ──────────────────────────────────────────

    /// @notice 移交合约所有权，部署脚本用于将 owner 从 deployer 转给 PermitVault
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── 铸造（仅 owner = PermitVault 可调用）─────────────────

    /// @notice 铸造奖励代币给用户
    /// @dev 按当前 _gonsPerFragment 换算 gons，mint 后余额立即受后续 rebase 影响
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Mint to zero address");
        uint256 gonValue = amount * _gonsPerFragment;
        _gonBalances[to] += gonValue;
        _totalSupply     += amount;
        emit Transfer(address(0), to, amount);
    }

    // ── Rebase ────────────────────────────────────────────

    function rebase() external onlyOwner {
        require(block.timestamp >= lastRebaseTime + REBASE_INTERVAL, "Rebase too early");
        _rebase();
    }

    /// @notice 测试用：无时间限制手动触发 rebase
    function manualRebase() external onlyOwner {
        _rebase();
    }

    function _rebase() internal {
        require(_totalSupply > 0, "No supply to rebase");
        rebaseCount++;
        uint256 newTotalSupply = (_totalSupply * DEFLATION_RATE) / RATE_DENOMINATOR;
        _totalSupply     = newTotalSupply;
        _gonsPerFragment = TOTAL_GONS / _totalSupply;
        lastRebaseTime   = block.timestamp;
        emit Rebase(rebaseCount, _totalSupply);
    }

    // ── 辅助查询 ──────────────────────────────────────────

    function gonsPerFragment() external view returns (uint256) { return _gonsPerFragment; }
    function canRebase()       external view returns (bool)    { return block.timestamp >= lastRebaseTime + REBASE_INTERVAL; }
    function nextRebaseTime()  external view returns (uint256) { return lastRebaseTime + REBASE_INTERVAL; }
    function gonBalanceOf(address who) external view returns (uint256) { return _gonBalances[who]; }
}
