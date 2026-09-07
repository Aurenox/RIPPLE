import {
  useEffect,
  useState
} from "react";

import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  LayoutDashboard,
  Menu,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  XCircle
} from "lucide-react";

import "./App.css";


const API = "http://127.0.0.1:8000";


type DocumentItem = {
  id: number;
  filename: string;
  file_type: string;
  uploaded_at: string;
  section_count: number;
};


type Section = {
  id: number;
  document_id: number;
  page_number: number | null;
  section_title: string;
  content: string;
};


type Impact = {
  id: number;
  document_id: number;
  document_name: string;
  section_id: number;
  section_title: string;
  page_number: number | null;
  content: string;
  affected: boolean;
  confidence: number;
  reason: string;
  suggested_fix: string;
  status: string;
};


type Dashboard = {
  documents: number;
  sections: number;
  affected: number;
  pending: number;
  approved: number;
  rejected: number;
  health: number;
  gemini: boolean;
  model: string;
};


function App() {

  const [documents, setDocuments] =
    useState<DocumentItem[]>([]);

  const [dashboard, setDashboard] =
    useState<Dashboard | null>(null);

  const [selectedDocument, setSelectedDocument] =
    useState<{
      document: DocumentItem;
      sections: Section[];
    } | null>(null);

  const [impacts, setImpacts] =
    useState<Impact[]>([]);

  const [changeTitle, setChangeTitle] =
    useState(
      "Exam Policy — Deadline Changed"
    );

  const [oldValue, setOldValue] =
    useState("Friday");

  const [newValue, setNewValue] =
    useState("Wednesday");

  const [loading, setLoading] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [activeView, setActiveView] =
    useState("dashboard");

  const [message, setMessage] =
    useState("");


  async function loadDashboard() {

    try {

      const response = await fetch(
        `${API}/dashboard`
      );

      const data = await response.json();

      setDashboard(data);

    } catch {

      setMessage(
        "Backend is not running."
      );
    }
  }


  async function loadDocuments() {

    try {

      const response = await fetch(
        `${API}/documents`
      );

      const data = await response.json();

      setDocuments(data);

    } catch {

      console.error(
        "Could not load documents"
      );
    }
  }


  async function refresh() {

    await Promise.all([
      loadDashboard(),
      loadDocuments()
    ]);
  }


  useEffect(() => {

    refresh();

  }, []);


  async function uploadFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {

    const file =
      event.target.files?.[0];

    if (!file) return;

    setUploading(true);
    setMessage("Uploading and indexing...");

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    try {

      const response =
        await fetch(
          `${API}/upload`,
          {
            method: "POST",
            body: formData
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data.detail ||
          "Upload failed"
        );
      }

      setMessage(
        `${file.name} indexed successfully.`
      );

      await refresh();

    } catch (error) {

      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed."
      );

    } finally {

      setUploading(false);
      event.target.value = "";
    }
  }


  async function openDocument(
    id: number
  ) {

    try {

      const response =
        await fetch(
          `${API}/documents/${id}`
        );

      const data =
        await response.json();

      setSelectedDocument(
        {
          document: data.document,
          sections: data.sections
        }
      );

      setActiveView(
        "knowledge"
      );

    } catch {

      setMessage(
        "Could not open document."
      );
    }
  }


  async function analyzeChange() {

    if (!oldValue.trim() ||
        !newValue.trim()) {

      setMessage(
        "Enter both old and new values."
      );

      return;
    }

    setLoading(true);
    setImpacts([]);
    setActiveView(
      "impact"
    );

    setMessage(
      "Gemini is analyzing the knowledge graph..."
    );

    try {

      const response =
        await fetch(
          `${API}/analyze-change`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify(
              {
                title: changeTitle,
                old_value: oldValue,
                new_value: newValue
              }
            )
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data.detail ||
          "Analysis failed."
        );
      }

      setImpacts(
        data.results || []
      );

      setMessage(
        `${data.affected_sections} affected sections detected using ${data.ai_engine}.`
      );

      await loadDashboard();

    } catch (error) {

      setMessage(
        error instanceof Error
          ? error.message
          : "Analysis failed."
      );

    } finally {

      setLoading(false);
    }
  }


  async function updateImpact(
    id: number,
    status: string
  ) {

    try {

      const response =
        await fetch(
          `${API}/impacts/${id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify(
              { status }
            )
          }
        );

      if (!response.ok) {

        throw new Error(
          "Could not update impact."
        );
      }

      setImpacts(
        current =>
          current.map(
            impact =>
              impact.id === id
                ? {
                    ...impact,
                    status
                  }
                : impact
          )
      );

      await loadDashboard();

    } catch {

      setMessage(
        "Could not update review."
      );
    }
  }


  async function resetData() {

    const confirmed =
      window.confirm(
        "Delete all RIPPLE documents and analysis data?"
      );

    if (!confirmed) return;

    await fetch(
      `${API}/reset`,
      {
        method: "DELETE"
      }
    );

    setSelectedDocument(null);
    setImpacts([]);

    await refresh();

    setMessage(
      "RIPPLE workspace reset."
    );
  }


  const affectedImpacts =
    impacts.filter(
      impact => impact.affected
    );


  return (
    <div className="app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-mark">
            R
          </div>

          <div>
            <div className="brand-name">
              RIPPLE
            </div>

            <div className="brand-sub">
              KNOWLEDGE INTELLIGENCE
            </div>
          </div>

        </div>


        <nav className="nav">

          <NavItem
            icon={<LayoutDashboard size={18} />}
            label="Dashboard"
            active={
              activeView === "dashboard"
            }
            onClick={() =>
              setActiveView(
                "dashboard"
              )
            }
          />

          <NavItem
            icon={<FileText size={18} />}
            label="Knowledge"
            active={
              activeView === "knowledge"
            }
            onClick={() =>
              setActiveView(
                "knowledge"
              )
            }
          />

          <NavItem
            icon={<Network size={18} />}
            label="Impact Analysis"
            active={
              activeView === "impact"
            }
            onClick={() =>
              setActiveView(
                "impact"
              )
            }
          />

          <NavItem
            icon={<AlertTriangle size={18} />}
            label="Conflicts"
            active={
              activeView === "conflicts"
            }
            onClick={() =>
              setActiveView(
                "conflicts"
              )
            }
          />

          <NavItem
            icon={<CheckCircle2 size={18} />}
            label="Review Queue"
            active={
              activeView === "review"
            }
            onClick={() =>
              setActiveView(
                "review"
              )
            }
          />

        </nav>


        <div className="sidebar-bottom">

          <div className="engine-status">

            <span className="status-dot" />

            <div>
              <strong>
                AI Engine
              </strong>

              <small>
                {dashboard?.gemini
                  ? "Gemini Online"
                  : "Fallback Mode"}
              </small>
            </div>

          </div>

          <button
            className="reset-button"
            onClick={resetData}
          >
            Reset Workspace
          </button>

        </div>

      </aside>


      {/* MAIN */}

      <main className="main">

        <header className="topbar">

          <div>

            <div className="eyebrow">
              KNOWLEDGE CONTROL CENTER
            </div>

            <h1>
              {activeView === "dashboard"
                ? "Dashboard"
                : activeView === "knowledge"
                ? "Knowledge Base"
                : activeView === "impact"
                ? "Impact Analysis"
                : activeView === "review"
                ? "Review Queue"
                : "Conflict Detection"}
            </h1>

          </div>


          <div className="top-actions">

            <button
              className="icon-button"
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>

            <label className="upload-button">

              <Upload size={17} />

              {uploading
                ? "Indexing..."
                : "Upload Knowledge"}

              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={
                  uploadFile
                }
                hidden
              />

            </label>

          </div>

        </header>


        {message && (

          <div className="message">

            <Sparkles size={16} />

            {message}

          </div>

        )}


        {/* DASHBOARD */}

        {activeView === "dashboard" && (

          <>

            <section className="hero">

              <div className="hero-copy">

                <div className="hero-label">
                  AI CHANGE INTELLIGENCE
                </div>

                <h2>
                  One change.
                  <br />
                  Every consequence.
                </h2>

                <p>
                  RIPPLE maps how knowledge
                  is connected, detects
                  downstream impact and
                  proposes safe updates
                  before outdated information
                  spreads.
                </p>

                <button
                  className="primary-button"
                  onClick={() =>
                    setActiveView(
                      "impact"
                    )
                  }
                >
                  Open Impact Analysis
                  <ChevronRight size={17} />
                </button>

              </div>


              <RippleGraphic />

            </section>


            <section className="stats">

              <Stat
                label="Knowledge Assets"
                value={
                  dashboard?.documents ?? 0
                }
                icon={
                  <FileText size={18} />
                }
              />

              <Stat
                label="Indexed Sections"
                value={
                  dashboard?.sections ?? 0
                }
                icon={
                  <Network size={18} />
                }
              />

              <Stat
                label="Affected"
                value={
                  dashboard?.affected ?? 0
                }
                icon={
                  <AlertTriangle
                    size={18}
                  />
                }
              />

              <Stat
                label="Pending Review"
                value={
                  dashboard?.pending ?? 0
                }
                icon={
                  <Activity size={18} />
                }
              />

            </section>


            <section className="dashboard-grid">

              <div className="panel">

                <div className="panel-heading">

                  <div>
                    <span className="section-kicker">
                      KNOWLEDGE HEALTH
                    </span>

                    <h3>
                      Workspace Integrity
                    </h3>
                  </div>

                  <ShieldCheck size={22} />

                </div>


                <div className="health">

                  <div className="health-score">
                    {dashboard?.health ?? 100}%
                  </div>

                  <div className="health-copy">
                    <strong>
                      Knowledge health
                    </strong>

                    <span>
                      Based on detected
                      downstream changes
                    </span>
                  </div>

                </div>


                <div className="progress">

                  <div
                    style={{
                      width: `${
                        dashboard?.health ?? 100
                      }%`
                    }}
                  />

                </div>

              </div>


              <div className="panel">

                <div className="panel-heading">

                  <div>
                    <span className="section-kicker">
                      LATEST ACTIVITY
                    </span>

                    <h3>
                      System Overview
                    </h3>
                  </div>

                  <Activity size={22} />

                </div>


                <div className="activity-list">

                  <ActivityRow
                    label="Documents indexed"
                    value={
                      dashboard?.documents ?? 0
                    }
                  />

                  <ActivityRow
                    label="Sections analyzed"
                    value={
                      dashboard?.sections ?? 0
                    }
                  />

                  <ActivityRow
                    label="Impact candidates"
                    value={
                      dashboard?.affected ?? 0
                    }
                  />

                  <ActivityRow
                    label="Approved fixes"
                    value={
                      dashboard?.approved ?? 0
                    }
                  />

                </div>

              </div>

            </section>

          </>
        )}


        {/* KNOWLEDGE */}

        {activeView === "knowledge" && (

          <section className="knowledge-layout">

            <div className="panel">

              <div className="panel-heading">

                <div>
                  <span className="section-kicker">
                    KNOWLEDGE REPOSITORY
                  </span>

                  <h3>
                    Indexed Documents
                  </h3>
                </div>

                <Search size={20} />

              </div>


              <div className="document-list">

                {documents.length === 0 && (

                  <div className="empty">

                    <FileText size={30} />

                    <strong>
                      No knowledge uploaded
                    </strong>

                    <span>
                      Upload a PDF, DOCX, TXT
                      or Markdown document.
                    </span>

                  </div>

                )}


                {documents.map(
                  document => (

                    <button
                      className="document-row"
                      key={
                        document.id
                      }
                      onClick={() =>
                        openDocument(
                          document.id
                        )
                      }
                    >

                      <div className="file-icon">
                        <FileText size={19} />
                      </div>

                      <div className="document-info">

                        <strong>
                          {document.filename}
                        </strong>

                        <span>
                          {
                            document.section_count
                          } indexed sections
                        </span>

                      </div>

                      <ChevronRight
                        size={17}
                      />

                    </button>

                  )
                )}

              </div>

            </div>


            {selectedDocument && (

              <div className="panel viewer">

                <div className="panel-heading">

                  <div>
                    <span className="section-kicker">
                      DOCUMENT VIEWER
                    </span>

                    <h3>
                      {
                        selectedDocument.document
                          .filename
                      }
                    </h3>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() =>
                      setSelectedDocument(
                        null
                      )
                    }
                  >
                    <X size={17} />
                  </button>

                </div>


                {selectedDocument.sections.map(
                  section => (

                    <article
                      className="section-card"
                      key={section.id}
                    >

                      <div className="section-meta">

                        <span>
                          {section.page_number
                            ? `PAGE ${section.page_number}`
                            : "SECTION"}
                        </span>

                        <span>
                          {section.section_title}
                        </span>

                      </div>

                      <p>
                        {section.content}
                      </p>

                    </article>

                  )
                )}

              </div>

            )}

          </section>

        )}


        {/* IMPACT ANALYSIS */}

        {activeView === "impact" && (

          <section className="impact-page">

            <div className="panel analyzer">

              <div className="panel-heading">

                <div>

                  <span className="section-kicker">
                    CHANGE INTELLIGENCE
                  </span>

                  <h3>
                    Simulate a knowledge change
                  </h3>

                </div>

                <GitBranch size={22} />

              </div>


              <div className="form-grid">

                <label>

                  <span>
                    Change title
                  </span>

                  <input
                    value={changeTitle}
                    onChange={e =>
                      setChangeTitle(
                        e.target.value
                      )
                    }
                  />

                </label>


                <label>

                  <span>
                    Old value
                  </span>

                  <input
                    value={oldValue}
                    onChange={e =>
                      setOldValue(
                        e.target.value
                      )
                    }
                  />

                </label>


                <label>

                  <span>
                    New value
                  </span>

                  <input
                    value={newValue}
                    onChange={e =>
                      setNewValue(
                        e.target.value
                      )
                    }
                  />

                </label>

              </div>


              <button
                className="primary-button analyze-button"
                onClick={
                  analyzeChange
                }
                disabled={loading}
              >

                <Sparkles size={17} />

                {loading
                  ? "Gemini analyzing..."
                  : "Analyze Ripple"}

              </button>

            </div>


            {loading && (

              <div className="loading-panel">

                <div className="loader" />

                <div>

                  <strong>
                    Gemini is reasoning across
                    your knowledge base
                  </strong>

                  <span>
                    Checking every indexed
                    section for semantic dependency.
                  </span>

                </div>

              </div>

            )}


            {impacts.length > 0 && (

              <div className="impact-results">

                <div className="impact-summary">

                  <div>

                    <span>
                      DETECTED IMPACT
                    </span>

                    <strong>
                      {
                        affectedImpacts.length
                      }
                    </strong>

                  </div>

                  <div>

                    <span>
                      TOTAL SECTIONS
                    </span>

                    <strong>
                      {impacts.length}
                    </strong>

                  </div>

                  <div>

                    <span>
                      REVIEW NEEDED
                    </span>

                    <strong>
                      {
                        affectedImpacts.filter(
                          x =>
                            x.status ===
                            "pending"
                        ).length
                      }
                    </strong>

                  </div>

                </div>


                {impacts.map(
                  impact => (

                    <ImpactCard
                      key={impact.id}
                      impact={impact}
                      onUpdate={
                        updateImpact
                      }
                    />

                  )
                )}

              </div>

            )}

          </section>

        )}


        {/* REVIEW */}

        {activeView === "review" && (

          <section className="panel">

            <div className="panel-heading">

              <div>

                <span className="section-kicker">
                  HUMAN OVERSIGHT
                </span>

                <h3>
                  Review Queue
                </h3>

              </div>

              <CheckCircle2 size={22} />

            </div>


            {impacts.filter(
              x =>
                x.affected &&
                x.status === "pending"
            ).length === 0 ? (

              <div className="empty">

                <CheckCircle2 size={32} />

                <strong>
                  Review queue is clear
                </strong>

                <span>
                  Run an impact analysis to
                  generate review candidates.
                </span>

              </div>

            ) : (

              impacts
                .filter(
                  x =>
                    x.affected &&
                    x.status === "pending"
                )
                .map(
                  impact => (

                    <ImpactCard
                      key={impact.id}
                      impact={impact}
                      onUpdate={
                        updateImpact
                      }
                    />

                  )
                )

            )}

          </section>

        )}


        {/* CONFLICTS */}

        {activeView === "conflicts" && (

          <section className="panel">

            <div className="panel-heading">

              <div>

                <span className="section-kicker">
                  KNOWLEDGE CONSISTENCY
                </span>

                <h3>
                  Conflict Detection
                </h3>

              </div>

              <AlertTriangle size={22} />

            </div>


            <div className="empty">

              <Network size={32} />

              <strong>
                Conflict engine ready
              </strong>

              <span>
                RIPPLE will surface contradictory
                knowledge when changes are analyzed.
              </span>

            </div>

          </section>

        )}

      </main>

    </div>
  );
}


/* ============================================================
   COMPONENTS
   ============================================================ */

function NavItem({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {

  return (

    <button
      className={
        active
          ? "nav-item active"
          : "nav-item"
      }
      onClick={onClick}
    >

      {icon}

      <span>
        {label}
      </span>

    </button>
  );
}


function Stat({
  label,
  value,
  icon
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {

  return (

    <div className="stat-card">

      <div className="stat-icon">
        {icon}
      </div>

      <div>

        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

      </div>

    </div>
  );
}


function ActivityRow({
  label,
  value
}: {
  label: string;
  value: number;
}) {

  return (

    <div className="activity-row">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


function RippleGraphic() {

  return (

    <div className="ripple-graphic">

      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit orbit-three" />

      <div className="graph-line line-one" />
      <div className="graph-line line-two" />
      <div className="graph-line line-three" />
      <div className="graph-line line-four" />

      <div className="graph-node node-center">
        <Sparkles size={23} />
      </div>

      <div className="graph-node node-one">
        <FileText size={17} />
      </div>

      <div className="graph-node node-two">
        <Network size={17} />
      </div>

      <div className="graph-node node-three">
        <GitBranch size={17} />
      </div>

      <div className="graph-node node-four">
        <ShieldCheck size={17} />
      </div>

      <div className="graph-label">
        KNOWLEDGE GRAPH
      </div>

    </div>
  );
}


function ImpactCard({
  impact,
  onUpdate
}: {
  impact: Impact;
  onUpdate: (
    id: number,
    status: string
  ) => void;
}) {

  const confidence =
    Math.round(
      impact.confidence * 100
    );


  return (

    <article
      className={
        impact.affected
          ? "impact-card affected"
          : "impact-card"
      }
    >

      <div className="impact-top">

        <div>

          <div className="impact-file">

            <FileText size={16} />

            {impact.document_name}

          </div>

          <h4>
            {impact.section_title}
          </h4>

        </div>


        <div
          className={
            impact.affected
              ? "impact-badge danger"
              : "impact-badge safe"
          }
        >

          {impact.affected
            ? <AlertTriangle size={14} />
            : <Check size={14} />}

          {impact.affected
            ? "AFFECTED"
            : "NO IMPACT"}

        </div>

      </div>


      <div className="impact-grid">

        <div>

          <span className="impact-label">
            LOCATION
          </span>

          <p>
            {impact.page_number
              ? `Page ${impact.page_number}`
              : "Document section"}
          </p>

        </div>


        <div>

          <span className="impact-label">
            CONFIDENCE
          </span>

          <p>
            {confidence}%
          </p>

        </div>


        <div className="why">

          <span className="impact-label">
            WHY IS THIS AFFECTED?
          </span>

          <p>
            {impact.reason}
          </p>

        </div>

      </div>


      {impact.affected &&
        impact.suggested_fix && (

          <div className="suggested-fix">

            <div className="fix-header">

              <Sparkles size={15} />

              AI SUGGESTED FIX

            </div>

            <p>
              {impact.suggested_fix}
            </p>

          </div>

        )}


      {impact.affected && (

        <div className="review-actions">

          <span>

            STATUS:{" "}

            <strong>
              {impact.status.toUpperCase()}
            </strong>

          </span>


          <div>

            <button
              className="reject-button"
              onClick={() =>
                onUpdate(
                  impact.id,
                  "rejected"
                )
              }
            >

              <XCircle size={15} />

              Reject

            </button>


            <button
              className="approve-button"
              onClick={() =>
                onUpdate(
                  impact.id,
                  "approved"
                )
              }
            >

              <CheckCircle2 size={15} />

              Approve

            </button>

          </div>

        </div>

      )}

    </article>
  );
}


export default App;