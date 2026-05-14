// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Capped } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FinderRewardToken (FNDT)
 * @notice ERC-20 reward token minted to finders who return lost items on the Foundit platform.
 * @dev Only the HandoverRegistry contract (set as minter atomically in the constructor) can mint tokens.
 *      Max supply is capped at 1,000,000 FNDT to prevent unbounded inflation.
 *
 *      Security improvements over v1:
 *      - `minter` is set atomically in the constructor — no front-running window.
 *      - `setMinter` is a one-time function (guarded by `minter == address(0)`).
 *      - Max supply enforced via ERC20Capped (1_000_000 FNDT).
 *      - Locked pragma (0.8.20) for deterministic builds.
 */
contract FinderRewardToken is ERC20Capped, Ownable {

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Hard cap on total token supply: 1,000,000 FNDT (18 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000 * 1e18;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Address permitted to call `mint()`. Immutable after first set.
    address public minter;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when the minter address is configured.
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @notice Deploy the token and optionally set the minter atomically.
     * @dev    Passing a non-zero `_minter` at construction time eliminates the
     *         front-running window that exists if `setMinter` is called in a
     *         separate transaction.  If `_minter` is zero the deployer may call
     *         `setMinter` exactly once afterwards.
     * @param _minter Address of the HandoverRegistry contract. Pass address(0)
     *                only if the registry is not yet deployed and will be set later.
     */
    constructor(address _minter)
        ERC20("Foundit Reward Token", "FNDT")
        ERC20Capped(MAX_SUPPLY)
        Ownable(msg.sender)
    {
        if (_minter != address(0)) {
            minter = _minter;
            emit MinterUpdated(address(0), _minter);
        }
    }

    // ─── Owner Functions ──────────────────────────────────────────────────────

    /**
     * @notice Set the HandoverRegistry as the sole minter (one-time only).
     * @dev    Reverts if `minter` is already set, preventing both accidental
     *         overwrites and front-running attacks.  Only the contract owner
     *         (deployer) may call this.
     * @param _minter Address of the HandoverRegistry contract.
     */
    function setMinter(address _minter) external onlyOwner {
        require(minter == address(0), "Minter already set");
        require(_minter != address(0), "Minter cannot be zero address");
        emit MinterUpdated(address(0), _minter);
        minter = _minter;
    }

    // ─── Minter Functions ─────────────────────────────────────────────────────

    /**
     * @notice Mint reward tokens to a finder.
     * @dev    Only callable by the authorised minter (HandoverRegistry).
     *         Will revert if `totalSupply() + amount > MAX_SUPPLY` (enforced by ERC20Capped).
     * @param to     The finder's wallet address.
     * @param amount Number of tokens to mint (in wei, 18 decimals).
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter can mint");
        require(to != address(0), "Cannot mint to zero address");
        _mint(to, amount);
    }

    // ─── Internal Overrides ───────────────────────────────────────────────────

    /**
     * @dev Required override to satisfy the Solidity compiler when inheriting
     *      ERC20Capped (which itself overrides ERC20._update).
     *      We only list ERC20Capped here because ERC20 is not a direct base of
     *      this contract in Solidity's C3 linearization — ERC20Capped already
     *      covers the ERC20 side via `super._update`.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Capped) {
        super._update(from, to, value);
    }
}
