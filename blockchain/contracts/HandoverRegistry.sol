// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HandoverRegistry
 * @dev A simple registry to log immutable proof of item handovers on the blockchain.
 */
contract HandoverRegistry {
    // Event emitted when a handover is recorded
    event HandoverRecorded(
        string claimId,
        string itemId,
        string claimantId,
        address recordedBy,
        uint256 timestamp
    );

    /**
     * @dev Records an item handover onto the blockchain.
     * @param claimId The unique ID of the approved claim.
     * @param itemId The unique ID of the lost/found item.
     * @param claimantId The unique ID of the user claiming the item.
     */
    function recordHandover(
        string memory claimId,
        string memory itemId,
        string memory claimantId
    ) public {
        emit HandoverRecorded(claimId, itemId, claimantId, msg.sender, block.timestamp);
    }
}
