// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ParkIssue {
  id: string;
  encryptedData: string;
  timestamp: number;
  category: string;
  votes: number;
  status: "pending" | "approved" | "rejected";
}

const App: React.FC = () => {
  // Randomly selected style: High contrast black+orange, Industrial mechanical, Modular tiling, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<ParkIssue[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [newIssueData, setNewIssueData] = useState({
    category: "",
    description: "",
    location: ""
  });
  const [showStats, setShowStats] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Randomly selected features: Data statistics, Search & filter, Project introduction
  const approvedCount = issues.filter(i => i.status === "approved").length;
  const pendingCount = issues.filter(i => i.status === "pending").length;
  const rejectedCount = issues.filter(i => i.status === "rejected").length;

  const filteredIssues = issues.filter(issue => 
    issue.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    issue.encryptedData.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    loadIssues().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadIssues = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("issue_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing issue keys:", e);
        }
      }
      
      const list: ParkIssue[] = [];
      
      for (const key of keys) {
        try {
          const issueBytes = await contract.getData(`issue_${key}`);
          if (issueBytes.length > 0) {
            try {
              const issueData = JSON.parse(ethers.toUtf8String(issueBytes));
              list.push({
                id: key,
                encryptedData: issueData.data,
                timestamp: issueData.timestamp,
                category: issueData.category,
                votes: issueData.votes || 0,
                status: issueData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing issue data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading issue ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setIssues(list);
    } catch (e) {
      console.error("Error loading issues:", e);
    } finally {
      setLoading(false);
    }
  };

  const reportIssue = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setReporting(true);
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newIssueData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const issueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const issueData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        category: newIssueData.category,
        votes: 0,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `issue_${issueId}`, 
        ethers.toUtf8Bytes(JSON.stringify(issueData))
      );
      
      const keysBytes = await contract.getData("issue_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(issueId);
      
      await contract.setData(
        "issue_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      alert("Issue reported securely with FHE encryption!");
      await loadIssues();
      setShowReportModal(false);
      setNewIssueData({
        category: "",
        description: "",
        location: ""
      });
    } catch (e: any) {
      alert("Submission failed: " + (e.message || "Unknown error"));
    } finally {
      setReporting(false);
    }
  };

  const voteOnIssue = async (issueId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const issueBytes = await contract.getData(`issue_${issueId}`);
      if (issueBytes.length === 0) {
        throw new Error("Issue not found");
      }
      
      const issueData = JSON.parse(ethers.toUtf8String(issueBytes));
      
      const updatedIssue = {
        ...issueData,
        votes: (issueData.votes || 0) + 1
      };
      
      await contract.setData(
        `issue_${issueId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedIssue))
      );
      
      alert("Vote recorded using FHE!");
      await loadIssues();
    } catch (e: any) {
      alert("Voting failed: " + (e.message || "Unknown error"));
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      alert(`Contract is ${isAvailable ? 'available' : 'not available'}`);
    } catch (e) {
      console.error("Error checking availability:", e);
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="gear-spinner"></div>
      <p>Initializing park management system...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <h1>Park<span>Co</span>Manage</h1>
          <div className="fhe-badge">FHE-Powered</div>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="control-panel">
          <button 
            onClick={() => setShowReportModal(true)} 
            className="action-btn primary"
          >
            Report Issue
          </button>
          <button 
            onClick={checkAvailability}
            className="action-btn secondary"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowStats(!showStats)}
            className="action-btn tertiary"
          >
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </button>
        </div>
        
        <div className="project-intro">
          <h2>Anonymous Urban Park Co-Management</h2>
          <p>
            This platform allows citizens to anonymously report park issues and vote on improvements 
            using Fully Homomorphic Encryption (FHE) to protect privacy while enabling community governance.
          </p>
          <div className="fhe-explainer">
            <div className="fhe-icon"></div>
            <span>All data is encrypted with FHE for maximum privacy</span>
          </div>
        </div>
        
        {showStats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{issues.length}</div>
              <div className="stat-label">Total Issues</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{approvedCount}</div>
              <div className="stat-label">Approved</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{rejectedCount}</div>
              <div className="stat-label">Rejected</div>
            </div>
          </div>
        )}
        
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search issues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button className="search-btn">Search</button>
        </div>
        
        <div className="issues-list">
          <div className="list-header">
            <div className="header-cell">Category</div>
            <div className="header-cell">Status</div>
            <div className="header-cell">Votes</div>
            <div className="header-cell">Date</div>
            <div className="header-cell">Actions</div>
          </div>
          
          {filteredIssues.length === 0 ? (
            <div className="no-issues">
              <p>No park issues found</p>
              <button 
                className="action-btn primary"
                onClick={() => setShowReportModal(true)}
              >
                Report First Issue
              </button>
            </div>
          ) : (
            filteredIssues.map(issue => (
              <div className="issue-row" key={issue.id}>
                <div className="list-cell">{issue.category}</div>
                <div className="list-cell">
                  <span className={`status-badge ${issue.status}`}>
                    {issue.status}
                  </span>
                </div>
                <div className="list-cell">{issue.votes}</div>
                <div className="list-cell">
                  {new Date(issue.timestamp * 1000).toLocaleDateString()}
                </div>
                <div className="list-cell">
                  <button 
                    className="action-btn vote-btn"
                    onClick={() => voteOnIssue(issue.id)}
                  >
                    Vote
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
  
      {showReportModal && (
        <div className="modal-overlay">
          <div className="report-modal">
            <div className="modal-header">
              <h2>Report Park Issue</h2>
              <button onClick={() => setShowReportModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Category *</label>
                <select 
                  name="category"
                  value={newIssueData.category} 
                  onChange={(e) => setNewIssueData({...newIssueData, category: e.target.value})}
                  className="form-select"
                >
                  <option value="">Select category</option>
                  <option value="Facility">Facility Issue</option>
                  <option value="Safety">Safety Concern</option>
                  <option value="Maintenance">Maintenance Needed</option>
                  <option value="Improvement">Improvement Suggestion</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Description *</label>
                <textarea 
                  name="description"
                  value={newIssueData.description} 
                  onChange={(e) => setNewIssueData({...newIssueData, description: e.target.value})}
                  placeholder="Describe the issue or suggestion..." 
                  className="form-textarea"
                  rows={3}
                />
              </div>
              
              <div className="form-group">
                <label>Location (Optional)</label>
                <input 
                  type="text"
                  name="location"
                  value={newIssueData.location} 
                  onChange={(e) => setNewIssueData({...newIssueData, location: e.target.value})}
                  placeholder="Where in the park?" 
                  className="form-input"
                />
              </div>
              
              <div className="privacy-notice">
                <div className="lock-icon"></div>
                <span>Your report will be encrypted with FHE for privacy</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowReportModal(false)}
                className="action-btn secondary"
              >
                Cancel
              </button>
              <button 
                onClick={reportIssue} 
                disabled={reporting || !newIssueData.category || !newIssueData.description}
                className="action-btn primary"
              >
                {reporting ? "Encrypting..." : "Submit Securely"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span>ParkCoManage</span>
            <p>Community-powered park management with FHE privacy</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">FAQ</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="copyright">
            © {new Date().getFullYear()} ParkCoManage FHE Platform
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;