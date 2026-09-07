import { useEffect, useState } from "react";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CheckCircle,
  FileText,
  GitBranch,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

import "./App.css";


const API = "http://127.0.0.1:8000";


type Document = {
  id: string;
  filename: string;
  file_type: string;
  sections: number;
  created_at: string;
};


type Section = {
  id: string;
  document_id: string;
  page_number: number;
  paragraph_number: number;
  section_title: string | null;
  content: string;
};


type Impact = {
  impact_id: string;
  section_id: string;
  document_id: string;
  filename: string;
  page_number: number;
  paragraph_number: number;
  section_title: string | null;
  content: string;
  confidence: number;
  reason: string;
  suggested_fix: string;
  status: string;
};


type Dashboard = {
  knowledge_sources: number;
  detected_changes: number;
  potential_conflicts: number;
  pending_reviews: number;
  knowledge_health: number;
};


function App() {

  const [documents, setDocuments] =
    useState<Document[]>([]);

  const [dashboard, setDashboard] =
    useState<Dashboard>({
      knowledge_sources: 0,
      detected_changes: 0,
      potential_conflicts: 0,
      pending_reviews: 0,
      knowledge_health: 100,
    });


  const [selectedDocument, setSelectedDocument] =
    useState<{
      document: Document;
      sections: Section[];
    } | null>(null);


  const [selectedPage, setSelectedPage] =
    useState(1);


  const [uploading, setUploading] =
    useState(false);


  const [showAnalyzer, setShowAnalyzer] =
    useState(false);


  const [analyzing, setAnalyzing] =
    useState(false);


  const [changeTitle, setChangeTitle] =
    useState("Exam Policy — Deadline changed");


  const [oldValue, setOldValue] =
    useState("Friday");


  const [newValue, setNewValue] =
    useState("Wednesday");


  const [impacts, setImpacts] =
    useState<Impact[]>([]);


  const [changeId, setChangeId] =
    useState<string | null>(null);


  const [activeNav, setActiveNav] =
    useState("Dashboard");


  const [message, setMessage] =
    useState("");


  useEffect(() => {
    loadDashboard();
    loadDocuments();
  }, []);


  async function loadDashboard() {

    try {

      const response =
        await fetch(`${API}/dashboard`);

      const data =
        await response.json();

      setDashboard(data);

    } catch {
      console.log("Backend unavailable");
    }
  }


  async function loadDocuments() {

    try {

      const response =
        await fetch(`${API}/documents`);

      const data =
        await response.json();

      setDocuments(data);

    } catch {
      console.log("Could not load documents");
    }
  }


  async function handleUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {

    const file =
      event.target.files?.[0];

    if (!file) return;


    setUploading(true);
    setMessage("");


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
            body: formData,
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
        `RIPPLE processed ${data.filename} — ${data.sections} knowledge sections detected.`
      );


      await loadDocuments();
      await loadDashboard();


    } catch (error) {

      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed"
      );

    } finally {

      setUploading(false);

    }
  }


  async function openDocument(
    document: Document
  ) {

    try {

      const response =
        await fetch(
          `${API}/documents/${document.id}`
        );

      const data =
        await response.json();


      setSelectedDocument(data);
      setSelectedPage(1);

    } catch {

      setMessage(
        "Unable to open document."
      );

    }
  }


  async function analyzeChange() {

    setAnalyzing(true);
    setImpacts([]);


    try {

      const response =
        await fetch(
          `${API}/analyze-change`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              title: changeTitle,
              old_value: oldValue,
              new_value: newValue,
            }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        throw new Error(
          data.detail ||
          "Analysis failed"
        );
      }


      setChangeId(
        data.change_id
      );

      setImpacts(
        data.impacts
      );

      setShowAnalyzer(true);

      await loadDashboard();


    } catch (error) {

      setMessage(
        error instanceof Error
          ? error.message
          : "Analysis failed"
      );

    } finally {

      setAnalyzing(false);

    }
  }


  async function reviewImpact(
    impactId: string,
    status: "approved" | "rejected"
  ) {

    try {

      await fetch(
        `${API}/impacts/${impactId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status,
          }),
        }
      );


      setImpacts(
        current =>
          current.map(
            impact =>
              impact.impact_id === impactId
                ? {
                    ...impact,
                    status,
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


  function highlightText(
    text: string
  ) {

    const terms = [
      oldValue,
      newValue,
    ].filter(Boolean);


    let result = text;


    for (const term of terms) {

      const regex =
        new RegExp(
          `(${term})`,
          "gi"
        );

      result =
        result.replace(
          regex,
          "<mark>$1</mark>"
        );
    }


    return {
      __html: result,
    };
  }


  const selectedPageSections =
    selectedDocument?.sections.filter(
      section =>
        section.page_number === selectedPage
    ) || [];


  return (

    <div className="app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-mark">
            R
          </div>

          <div>
            <h1>RIPPLE</h1>
            <span>
              Knowledge Intelligence
            </span>
          </div>

        </div>


        <nav>

          {[
            ["Dashboard", Activity],
            ["Knowledge", FileText],
            ["Impact Analysis", GitBranch],
            ["Conflicts", AlertTriangle],
            ["Review Queue", ShieldCheck],
          ].map(
            ([label, Icon]: any) => (

              <button
                key={label}
                className={
                  activeNav === label
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => {

                  setActiveNav(label);

                  if (
                    label ===
                    "Impact Analysis"
                  ) {
                    setShowAnalyzer(true);
                  }

                }}
              >

                <Icon size={18} />

                {label}

              </button>

            )
          )}

        </nav>


        <div className="sidebar-bottom">

          <div className="ai-status">

            <span className="status-dot" />

            AI Engine Online

          </div>

        </div>

      </aside>


      {/* MAIN */}

      <main className="main">

        <header className="topbar">

          <div>

            <p className="eyebrow">
              KNOWLEDGE CONTROL CENTER
            </p>

            <h2>
              Good evening.
            </h2>

          </div>


          <label className="upload-button">

            <Upload size={17} />

            {uploading
              ? "Processing..."
              : "Upload Knowledge"}

            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              hidden
              onChange={
                handleUpload
              }
            />

          </label>

        </header>


        {message && (

          <div className="message">

            <CheckCircle size={17} />

            {message}

          </div>

        )}


        {/* HERO */}

        <section className="hero">

          <div>

            <p className="eyebrow">
              RIPPLE INTELLIGENCE
            </p>

            <h3>
              One change.
              <br />
              <span>
                Every consequence.
              </span>
            </h3>

            <p className="hero-text">
              Understand your knowledge,
              trace change propagation,
              and review AI-proposed fixes.
            </p>

          </div>


          <div className="health">

            <div className="health-ring">

              <strong>
                {dashboard.knowledge_health}
              </strong>

              <span>
                /100
              </span>

            </div>


            <div>

              <p>
                Knowledge Health
              </p>

              <small>
                Live consistency score
              </small>

            </div>

          </div>

        </section>


        {/* STATS */}

        <section className="stats">

          <Stat
            label="Knowledge Sources"
            value={
              dashboard.knowledge_sources
            }
            change="Documents indexed"
          />

          <Stat
            label="Detected Changes"
            value={
              dashboard.detected_changes
            }
            change="Changes analyzed"
          />

          <Stat
            label="Potential Conflicts"
            value={
              dashboard.potential_conflicts
            }
            change="High-confidence impacts"
          />

          <Stat
            label="Pending Reviews"
            value={
              dashboard.pending_reviews
            }
            change="Human approval required"
          />

        </section>


        {/* KNOWLEDGE */}

        <section className="content-grid">

          <div className="panel">

            <div className="panel-header">

              <div>

                <p className="eyebrow">
                  KNOWLEDGE BASE
                </p>

                <h4>
                  Indexed sources
                </h4>

              </div>


              <button
                className="text-button"
                onClick={
                  loadDocuments
                }
              >

                Refresh

                <RefreshCw
                  size={15}
                />

              </button>

            </div>


            {documents.length === 0 ? (

              <div className="empty">

                <FileText
                  size={30}
                />

                <strong>
                  No knowledge uploaded
                </strong>

                <p>
                  Upload your first PDF
                  or DOCX to begin.
                </p>

              </div>

            ) : (

              <div className="document-list">

                {documents.map(
                  document => (

                    <button
                      className="document-row"
                      key={document.id}
                      onClick={() =>
                        openDocument(
                          document
                        )
                      }
                    >

                      <div className="document-icon">

                        <FileText
                          size={19}
                        />

                      </div>


                      <div>

                        <strong>
                          {document.filename}
                        </strong>

                        <span>
                          {document.sections}
                          {" "}knowledge sections
                        </span>

                      </div>


                      <ArrowUpRight
                        size={17}
                      />

                    </button>

                  )
                )}

              </div>

            )}

          </div>


          {/* ACTIVE RIPPLE */}

          <div className="panel ripple-panel">

            <p className="eyebrow">
              ACTIVE RIPPLE
            </p>

            <h4>
              Change propagation
            </h4>


            <div className="ripple-graph">

              <div className="graph-node root">

                <FileText size={17} />

                New Rule

              </div>


              <div className="graph-line" />


              <div className="graph-node affected">

                <FileText size={15} />

                Source Policy

                <span>
                  Changed
                </span>

              </div>


              <div className="graph-line" />


              <div className="graph-node affected">

                <FileText size={15} />

                Dependent Knowledge

                <span>
                  Review
                </span>

              </div>

            </div>


            <button
              className="analysis-button"
              onClick={() =>
                setShowAnalyzer(true)
              }
            >

              Open Impact Analysis

              <ArrowUpRight
                size={16}
              />

            </button>

          </div>

        </section>


        {/* DOCUMENT VIEWER */}

        {selectedDocument && (

          <section className="panel document-section">

            <div className="panel-header">

              <div>

                <p className="eyebrow">
                  KNOWLEDGE VIEWER
                </p>

                <h4>
                  {
                    selectedDocument.document
                      .filename
                  }
                </h4>

              </div>


              <button
                className="text-button"
                onClick={() =>
                  setSelectedDocument(
                    null
                  )
                }
              >
                Close
              </button>

            </div>


            <div className="document-layout">

              <div className="page-list">

                {Array.from(
                  new Set(
                    selectedDocument.sections.map(
                      section =>
                        section.page_number
                    )
                  )
                ).map(page => (

                  <button
                    key={page}
                    className={
                      selectedPage === page
                        ? "page-button active-page"
                        : "page-button"
                    }
                    onClick={() =>
                      setSelectedPage(
                        page
                      )
                    }
                  >

                    <FileText
                      size={16}
                    />

                    Page {page}

                  </button>

                ))}

              </div>


              <div className="document-viewer">

                <div className="viewer-header">

                  <div>

                    <p className="eyebrow">
                      EXTRACTED CONTENT
                    </p>

                    <strong>
                      Page {selectedPage}
                    </strong>

                  </div>

                  <Search size={18} />

                </div>


                <div className="document-text">

                  {selectedPageSections.map(
                    section => (

                      <div
                        className="text-section"
                        key={section.id}
                      >

                        {section.section_title && (

                          <h5>
                            {
                              section.section_title
                            }
                          </h5>

                        )}

                        <p
                          dangerouslySetInnerHTML={
                            highlightText(
                              section.content
                            )
                          }
                        />

                      </div>

                    )
                  )}

                </div>

              </div>

            </div>

          </section>

        )}


        {/* IMPACT ANALYZER */}

        {showAnalyzer && (

          <section className="panel analyzer">

            <div className="panel-header">

              <div>

                <p className="eyebrow">
                  AI IMPACT ANALYSIS
                </p>

                <h4>
                  Find every consequence
                </h4>

              </div>


              <Brain
                size={24}
              />

            </div>


            <div className="change-form">

              <label>

                Change title

                <input
                  value={changeTitle}
                  onChange={event =>
                    setChangeTitle(
                      event.target.value
                    )
                  }
                />

              </label>


              <label>

                Old value

                <input
                  value={oldValue}
                  onChange={event =>
                    setOldValue(
                      event.target.value
                    )
                  }
                />

              </label>


              <label>

                New value

                <input
                  value={newValue}
                  onChange={event =>
                    setNewValue(
                      event.target.value
                    )
                  }
                />

              </label>


              <button
                className="analyze-button"
                onClick={
                  analyzeChange
                }
                disabled={analyzing}
              >

                <Brain size={17} />

                {analyzing
                  ? "Analyzing..."
                  : "Analyze Ripple"}

              </button>

            </div>


            {impacts.length > 0 && (

              <div className="results">

                <div className="result-summary">

                  <strong>
                    {impacts.length}
                  </strong>

                  affected sections detected

                </div>


                {impacts.map(
                  impact => (

                    <div
                      className="impact-card"
                      key={
                        impact.impact_id
                      }
                    >

                      <div className="impact-top">

                        <div>

                          <span className="file-label">

                            <FileText
                              size={15}
                            />

                            {
                              impact.filename
                            }

                          </span>


                          <h5>

                            Page {
                              impact.page_number
                            }

                            {" · "}

                            Paragraph {
                              impact.paragraph_number
                            }

                          </h5>

                        </div>


                        <span
                          className={
                            impact.confidence >= 85
                              ? "confidence high"
                              : "confidence"
                          }
                        >

                          {
                            impact.confidence
                          }%
                          confidence

                        </span>

                      </div>


                      <div className="affected-content">

                        <p
                          dangerouslySetInnerHTML={
                            highlightText(
                              impact.content
                            )
                          }
                        />

                      </div>


                      <div className="why-box">

                        <Brain
                          size={18}
                        />

                        <div>

                          <strong>
                            Why is this affected?
                          </strong>

                          <p>
                            {impact.reason}
                          </p>

                        </div>

                      </div>


                      <div className="fix-box">

                        <p className="eyebrow">
                          AI PROPOSED FIX
                        </p>

                        <p>
                          {
                            impact.suggested_fix
                          }
                        </p>

                      </div>


                      {impact.status ===
                        "pending" ? (

                        <div className="review-actions">

                          <button
                            className="approve-button"
                            onClick={() =>
                              reviewImpact(
                                impact.impact_id,
                                "approved"
                              )
                            }
                          >

                            <CheckCircle
                              size={16}
                            />

                            Approve Fix

                          </button>


                          <button
                            className="reject-button"
                            onClick={() =>
                              reviewImpact(
                                impact.impact_id,
                                "rejected"
                              )
                            }
                          >

                            <XCircle
                              size={16}
                            />

                            Reject

                          </button>

                        </div>

                      ) : (

                        <div className="reviewed">

                          <CheckCircle
                            size={16}
                          />

                          Reviewed: {
                            impact.status
                          }

                        </div>

                      )}

                    </div>

                  )
                )}

              </div>

            )}


            {changeId && impacts.length === 0 && (

              <div className="empty">

                <CheckCircle
                  size={30}
                />

                <strong>
                  No affected sections detected
                </strong>

                <p>
                  RIPPLE found no strong
                  relationship with this change.
                </p>

              </div>

            )}

          </section>

        )}

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
  value: number;
  change: string;
}) {

  return (

    <div className="stat-card">

      <p>
        {label}
      </p>

      <strong>
        {value}
      </strong>

      <span>
        {change}
      </span>

    </div>

  );
}


export default App;