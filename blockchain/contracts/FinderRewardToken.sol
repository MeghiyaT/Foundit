// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FinderRewardToken (FNDT)
 * @dev ERC-20 reward token minted to finders who return lost items.
 *      Only the HandoverRegistry contract (set as minter) can mint tokens.
 */
contract FinderRewardToken is ERC20, Ownable {
    address public minter;

    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    constructor() ERC20("Foundit Reward Token", "FNDT") Ownable(msg.sender) {}

    /**
     * @dev Set the HandoverRegistry as the sole minter.
     * @param _minter Address of the HandoverRegistry contract.
     */
    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "Minter cannot be zero address");
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    /**
     * @dev Mint reward tokens to a finder. Only callable by the minter.
     * @param to The finder's wallet address.
     * @param amount Number of tokens to mint (in wei, 18 decimals).
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter can mint");
        require(to != address(0), "Cannot mint to zero address");
        _mint(to, amount);
    }
}
