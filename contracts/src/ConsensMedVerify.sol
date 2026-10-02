// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConsensMedVerify: public authenticity registry for documents, with no document data on-chain.
contract ConsensMedVerify is Ownable {
    enum Status {
        NOT_FOUND,
        VALID,
        MISMATCH,
        REVOKED,
        SUPERSEDED
    }

    struct Entry {
        bytes32 contentHash;
        bytes32 supersededBy;
        address issuer;
        uint64 issuedAt;
        Status status;
    }

    mapping(bytes32 docId => Entry) private _entries;
    mapping(bytes32 contentHash => bytes32 docId) private _docIdByHash;
    mapping(address submitter => bool allowed) public isSubmitter;

    event Issued(bytes32 indexed docId, bytes32 indexed contentHash, address indexed issuer, uint64 issuedAt);
    event Revoked(bytes32 indexed docId, uint8 indexed reasonCode, address indexed submitter);
    event Superseded(bytes32 indexed docId, bytes32 indexed newDocId, address indexed submitter);
    event SubmitterSet(address indexed submitter, bool allowed);

    error NotSubmitter(address caller);
    error ZeroValue();
    error DocIdAlreadyIssued(bytes32 docId);
    error ContentAlreadyIssued(bytes32 contentHash);
    error NotValid(bytes32 docId);
    error SameDocument();

    modifier onlySubmitter() {
        if (!isSubmitter[msg.sender]) revert NotSubmitter(msg.sender);
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setSubmitter(address submitter, bool allowed) external onlyOwner {
        isSubmitter[submitter] = allowed;
        emit SubmitterSet(submitter, allowed);
    }

    function issue(bytes32 docId, bytes32 contentHash) external onlySubmitter {
        if (docId == bytes32(0) || contentHash == bytes32(0)) revert ZeroValue();
        if (_entries[docId].issuedAt != 0) revert DocIdAlreadyIssued(docId);
        if (_docIdByHash[contentHash] != bytes32(0)) revert ContentAlreadyIssued(contentHash);

        // forge-lint: disable-next-line(unsafe-typecast) -- a unix timestamp fits uint64 for billions of years
        uint64 issuedAt = uint64(block.timestamp);
        _entries[docId] = Entry({
            contentHash: contentHash,
            supersededBy: bytes32(0),
            issuer: msg.sender,
            issuedAt: issuedAt,
            status: Status.VALID
        });
        _docIdByHash[contentHash] = docId;
        emit Issued(docId, contentHash, msg.sender, issuedAt);
    }

    function revoke(bytes32 docId, uint8 reasonCode) external onlySubmitter {
        Entry storage entry = _entries[docId];
        if (entry.status != Status.VALID) revert NotValid(docId);
        entry.status = Status.REVOKED;
        emit Revoked(docId, reasonCode, msg.sender);
    }

    function supersede(bytes32 oldDocId, bytes32 newDocId) external onlySubmitter {
        if (oldDocId == newDocId) revert SameDocument();
        Entry storage oldEntry = _entries[oldDocId];
        if (oldEntry.status != Status.VALID) revert NotValid(oldDocId);
        if (_entries[newDocId].status != Status.VALID) revert NotValid(newDocId);
        oldEntry.status = Status.SUPERSEDED;
        oldEntry.supersededBy = newDocId;
        emit Superseded(oldDocId, newDocId, msg.sender);
    }

    // A wrong fingerprint reports MISMATCH even for revoked or superseded entries:
    // the file in hand is not the registered document, whatever happened to that document later.
    function verify(bytes32 docId, bytes32 contentHash) external view returns (Status) {
        Entry storage entry = _entries[docId];
        if (entry.issuedAt == 0) return Status.NOT_FOUND;
        if (entry.contentHash != contentHash) return Status.MISMATCH;
        return entry.status;
    }

    function record(bytes32 docId)
        external
        view
        returns (bytes32 contentHash, uint64 issuedAt, Status status, bytes32 supersededBy, address issuer)
    {
        Entry storage entry = _entries[docId];
        return (entry.contentHash, entry.issuedAt, entry.status, entry.supersededBy, entry.issuer);
    }

    function docIdOf(bytes32 contentHash) external view returns (bytes32) {
        return _docIdByHash[contentHash];
    }
}
