// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Errors } from "./lib/Errors.sol";

/// @title  CredentialSBT — Soulbound medical-license tokens
/// @author Polyglot-Attest
/// @notice An ERC-721 token issued by a Medical Board to a doctor's wallet to
///         attest that the holder is a currently licensed clinician.
/// @dev    Soulbound: tokens may only be minted (`from == address(0)`) or
///         burned (`to == address(0)`). Any transfer between two non-zero
///         addresses reverts. Each address may hold at most one license.
///
/// The license records a specialty (e.g. "internal_medicine"), an expiry
/// timestamp, and a suspension flag. `hasValidLicense(doctor)` is the cheap
/// view used by `InferenceAttestation` as a pre-flight gate.
contract CredentialSBT is ERC721 {
    // ── types ────────────────────────────────────────────────────────────────

    struct License {
        string  licenseNumber; // human-readable board ID
        string  specialty;     // e.g. "internal_medicine", "radiology"
        uint64  issuedAt;
        uint64  expiresAt;
        address issuer;        // medical board address that minted
        bool    suspended;     // true if the board has revoked privileges
    }

    // ── state ────────────────────────────────────────────────────────────────

    /// @notice The single Medical Board allowed to issue or suspend licenses.
    /// @dev    For thesis MVP this is one address; production would be a Safe.
    address public immutable MEDICAL_BOARD;

    /// @dev Token-id → license record.
    mapping(uint256 tokenId => License) public licenses;

    /// @dev Doctor address → token-id (0 means unlicensed).
    mapping(address doctor => uint256 tokenId) public doctorTokenId;

    /// @dev Auto-incrementing token id counter (starts at 1).
    uint256 private _nextTokenId = 1;

    // ── events ───────────────────────────────────────────────────────────────

    event LicenseIssued(
        address indexed doctor,
        uint256 indexed tokenId,
        string licenseNumber,
        string specialty,
        uint64 expiresAt
    );

    event LicenseSuspended(uint256 indexed tokenId, address indexed doctor, string reason);

    event LicenseReinstated(uint256 indexed tokenId, address indexed doctor);

    event LicenseExpiryUpdated(uint256 indexed tokenId, uint64 newExpiresAt);

    // ── ctor ─────────────────────────────────────────────────────────────────

    constructor(address medicalBoard) ERC721("Polyglot Medical License", "POLYMED") {
        MEDICAL_BOARD = medicalBoard;
    }

    // ── mod ──────────────────────────────────────────────────────────────────

    modifier onlyBoard() {
        if (msg.sender != MEDICAL_BOARD) revert Errors.NotMedicalBoard(msg.sender);
        _;
    }

    // ── soulbound enforcement ────────────────────────────────────────────────

    /// @inheritdoc ERC721
    /// @dev Only mint (from == 0x0) or burn (to == 0x0) is allowed; transfers revert.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert Errors.SoulboundTransferDisallowed();
        }
        return super._update(to, tokenId, auth);
    }

    /// @notice Approvals are meaningless for a non-transferable token.
    function approve(address, uint256) public pure override {
        revert Errors.SoulboundTransferDisallowed();
    }

    /// @notice Approvals are meaningless for a non-transferable token.
    function setApprovalForAll(address, bool) public pure override {
        revert Errors.SoulboundTransferDisallowed();
    }

    // ── board actions ────────────────────────────────────────────────────────

    /// @notice Issue a new license SBT to `doctor`.
    /// @param  doctor        Wallet that will hold (and use) the license.
    /// @param  licenseNumber Human-readable board identifier.
    /// @param  specialty     Free-text clinical specialty tag.
    /// @param  expiresAt     Unix seconds at which the license becomes invalid.
    /// @return tokenId       The minted token id.
    function issue(
        address doctor,
        string calldata licenseNumber,
        string calldata specialty,
        uint64 expiresAt
    )
        external
        onlyBoard
        returns (uint256 tokenId)
    {
        if (doctorTokenId[doctor] != 0) revert Errors.LicenseAlreadyIssued(doctor);
        if (expiresAt <= block.timestamp) revert Errors.LicenseExpired(doctor, expiresAt);

        tokenId = _nextTokenId++;
        _mint(doctor, tokenId);

        licenses[tokenId] = License({
            licenseNumber: licenseNumber,
            specialty:     specialty,
            issuedAt:      uint64(block.timestamp),
            expiresAt:     expiresAt,
            issuer:        msg.sender,
            suspended:     false
        });
        doctorTokenId[doctor] = tokenId;

        emit LicenseIssued(doctor, tokenId, licenseNumber, specialty, expiresAt);
    }

    /// @notice Suspend (without burning) a license. Reversible via `reinstate`.
    function suspend(uint256 tokenId, string calldata reason) external onlyBoard {
        address doctor = ownerOf(tokenId);
        licenses[tokenId].suspended = true;
        emit LicenseSuspended(tokenId, doctor, reason);
    }

    /// @notice Lift a previously imposed suspension.
    function reinstate(uint256 tokenId) external onlyBoard {
        address doctor = ownerOf(tokenId);
        licenses[tokenId].suspended = false;
        emit LicenseReinstated(tokenId, doctor);
    }

    /// @notice Adjust the expiry of an existing license (renewals).
    function updateExpiry(uint256 tokenId, uint64 newExpiresAt) external onlyBoard {
        ownerOf(tokenId); // revert if non-existent
        licenses[tokenId].expiresAt = newExpiresAt;
        emit LicenseExpiryUpdated(tokenId, newExpiresAt);
    }

    // ── views ────────────────────────────────────────────────────────────────

    /// @notice Cheap pre-flight check used by InferenceAttestation.
    /// @return ok True iff doctor holds a non-suspended, non-expired license.
    function hasValidLicense(address doctor) external view returns (bool ok) {
        uint256 tokenId = doctorTokenId[doctor];
        if (tokenId == 0) return false;
        License memory L = licenses[tokenId];
        if (L.suspended) return false;
        if (block.timestamp > L.expiresAt) return false;
        return true;
    }
}
