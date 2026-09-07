import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  FileText,
  GitBranch,
  ShieldCheck,
  Upload,
} from "lucide-react";
import "./App.css";

function App() {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();

      alert(`Uploaded successfully: ${data.filename}`);
    } catch (error) {
      console.error(error);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>

          <div>
            <h1>RIPPLE</h1>
            <span>Knowledge Intelligence</span>
          </div>
        </div>

        <nav>
          <button className="nav-item active">
            <Activity size={18} />
            Dashboard
          </button>

          <button className="nav-item">
            <FileText size={18} />
            Knowledge
          </button>

          <button className="nav-item">
            <GitBranch size={18} />
            Impact Analysis
          </button>

          <button className="nav-item">
            <AlertTriangle size={18} />
            Conflicts
          </button>

          <button className="nav-item">
            <ShieldCheck size={18} />
            Review Queue
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="ai-status">
            <span className="status-dot" />
            AI Engine Online
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">KNOWLEDGE CONTROL CENTER</p>
            <h2>Good evening.</h2>
          </div>

          <label className="upload-button">
            <Upload size={17} />

            {uploading ? "Uploading..." : "Upload Knowledge"}

            <input
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              onChange={handleUpload}
              hidden
            />
          </label>
        </header>

        <section className="hero">
          <div>
            <p className="eyebrow">RIPPLE INTELLIGENCE</p>

            <h3>
              One change.
              <br />
              <span>Every consequence.</span>
            </h3>

            <p className="hero-text">
              Detect outdated knowledge, trace its impact, and repair affected
              information with AI.
            </p>
          </div>

          <div className="health">
            <div className="health-ring">
              <strong>92</strong>
              <span>/100</span>
            </div>

            <div>
              <p>Knowledge Health</p>
              <small>Excellent consistency</small>
            </div>
          </div>
        </section>

        <section className="stats">
          <Stat
            label="Knowledge Sources"
            value="248"
            change="+12 this month"
          />

          <Stat
            label="Detected Changes"
            value="17"
            change="5 need review"
          />

          <Stat
            label="Potential Conflicts"
            value="07"
            change="2 critical"
          />

          <Stat
            label="Pending Reviews"
            value="12"
            change="4 high priority"
          />
        </section>

        <section className="content-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">LATEST ACTIVITY</p>
                <h4>Knowledge changes</h4>
              </div>

              <button className="text-button">
                View all <ArrowUpRight size={15} />
              </button>
            </div>

            <div className="change">
              <div className="change-icon danger">!</div>

              <div className="change-info">
                <strong>Exam Policy — Deadline changed</strong>
                <p>Friday → Wednesday</p>
              </div>

              <span className="badge danger-badge">
                5 affected
              </span>
            </div>

            <div className="change">
              <div className="change-icon warning">!</div>

              <div className="change-info">
                <strong>Admission Guidelines updated</strong>
                <p>Verification requirement added</p>
              </div>

              <span className="badge warning-badge">
                3 affected
              </span>
            </div>

            <div className="change">
              <div className="change-icon safe">✓</div>

              <div className="change-info">
                <strong>Library Policy reviewed</strong>
                <p>No downstream conflicts found</p>
              </div>

              <span className="badge safe-badge">
                Clear
              </span>
            </div>
          </div>

          <div className="panel ripple-panel">
            <p className="eyebrow">ACTIVE RIPPLE</p>

            <h4>Exam Policy</h4>

            <div className="ripple-graph">
              <div className="graph-node root">
                <FileText size={17} />
                Exam Policy
              </div>

              <div className="graph-line" />

              <div className="graph-node affected">
                <FileText size={15} />
                Student Handbook
                <span>Page 12</span>
              </div>

              <div className="graph-line" />

              <div className="graph-node affected">
                <FileText size={15} />
                Assignment FAQ
                <span>Section 4</span>
              </div>
            </div>

            <button className="analysis-button">
              Open Impact Analysis
              <ArrowUpRight size={16} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: string;
}) {
  return (
    <div className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{change}</span>
    </div>
  );
}

export default App;