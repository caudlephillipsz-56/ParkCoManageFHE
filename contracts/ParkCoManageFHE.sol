// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ParkCoManageFHE is SepoliaConfig {
    enum ReportType { ISSUE, SUGGESTION, VOTE }

    struct EncryptedReport {
        uint256 id;
        euint32 encryptedContent;
        euint32 encryptedType;
        euint32 encryptedPriority;
        uint256 timestamp;
    }

    struct DecryptedReport {
        string content;
        ReportType reportType;
        uint32 priority;
        bool isRevealed;
    }

    struct EncryptedVote {
        euint32 encryptedOption;
        euint32 encryptedWeight;
    }

    uint256 public reportCount;
    mapping(uint256 => EncryptedReport) public encryptedReports;
    mapping(uint256 => DecryptedReport) public decryptedReports;
    mapping(uint256 => EncryptedVote[]) public proposalVotes;
    
    mapping(ReportType => euint32) private encryptedTypeCounts;
    mapping(uint256 => euint32) private encryptedVoteCounts;
    
    mapping(uint256 => uint256) private requestToReportId;
    
    event ReportSubmitted(uint256 indexed id, uint256 timestamp);
    event VoteCast(uint256 indexed proposalId, uint256 voteCount);
    event DecryptionRequested(uint256 indexed id);
    event ReportDecrypted(uint256 indexed id);
    
    modifier onlyAdmin() {
        _;
    }

    function submitEncryptedReport(
        euint32 encryptedContent,
        euint32 encryptedType,
        euint32 encryptedPriority
    ) public {
        reportCount += 1;
        uint256 newId = reportCount;
        
        encryptedReports[newId] = EncryptedReport({
            id: newId,
            encryptedContent: encryptedContent,
            encryptedType: encryptedType,
            encryptedPriority: encryptedPriority,
            timestamp: block.timestamp
        });
        
        decryptedReports[newId] = DecryptedReport({
            content: "",
            reportType: ReportType.ISSUE,
            priority: 0,
            isRevealed: false
        });
        
        emit ReportSubmitted(newId, block.timestamp);
    }

    function castEncryptedVote(
        uint256 proposalId,
        euint32 encryptedOption,
        euint32 encryptedWeight
    ) public {
        proposalVotes[proposalId].push(EncryptedVote({
            encryptedOption: encryptedOption,
            encryptedWeight: encryptedWeight
        }));
        
        if (!FHE.isInitialized(encryptedVoteCounts[proposalId])) {
            encryptedVoteCounts[proposalId] = FHE.asEuint32(0);
        }
        encryptedVoteCounts[proposalId] = FHE.add(encryptedVoteCounts[proposalId], FHE.asEuint32(1));
        
        emit VoteCast(proposalId, proposalVotes[proposalId].length);
    }

    function requestReportDecryption(uint256 reportId) public onlyAdmin {
        EncryptedReport storage report = encryptedReports[reportId];
        require(!decryptedReports[reportId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(report.encryptedContent);
        ciphertexts[1] = FHE.toBytes32(report.encryptedType);
        ciphertexts[2] = FHE.toBytes32(report.encryptedPriority);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptReport.selector);
        requestToReportId[reqId] = reportId;
        
        emit DecryptionRequested(reportId);
    }

    function decryptReport(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 reportId = requestToReportId[requestId];
        require(reportId != 0, "Invalid request");
        
        EncryptedReport storage eReport = encryptedReports[reportId];
        DecryptedReport storage dReport = decryptedReports[reportId];
        require(!dReport.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory content, uint32 typeValue, uint32 priority) = abi.decode(cleartexts, (string, uint32, uint32));
        
        dReport.content = content;
        dReport.reportType = ReportType(typeValue);
        dReport.priority = priority;
        dReport.isRevealed = true;
        
        if (FHE.isInitialized(encryptedTypeCounts[dReport.reportType]) == false) {
            encryptedTypeCounts[dReport.reportType] = FHE.asEuint32(0);
        }
        encryptedTypeCounts[dReport.reportType] = FHE.add(
            encryptedTypeCounts[dReport.reportType],
            FHE.asEuint32(1)
        );
        
        emit ReportDecrypted(reportId);
    }

    function requestVoteAggregation(uint256 proposalId) public onlyAdmin {
        require(proposalVotes[proposalId].length > 0, "No votes");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(encryptedVoteCounts[proposalId]);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptVoteCount.selector);
        requestToReportId[reqId] = proposalId;
    }

    function decryptVoteCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 proposalId = requestToReportId[requestId];
        require(proposalId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 voteCount = abi.decode(cleartexts, (uint32));
    }

    function getDecryptedReport(uint256 reportId) public view returns (
        string memory content,
        ReportType reportType,
        uint32 priority,
        bool isRevealed
    ) {
        DecryptedReport storage r = decryptedReports[reportId];
        return (r.content, r.reportType, r.priority, r.isRevealed);
    }

    function getVoteCount(uint256 proposalId) public view returns (uint256) {
        return proposalVotes[proposalId].length;
    }
}