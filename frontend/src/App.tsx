import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  GitBranch,
  Layers3,
  Lightbulb,
  Lock,
  LogOut,
  Menu,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  X,
  Zap,
} from "lucide-react";
import "./App.css";

const API = "http://127.0.0.1:8000";

type View =
  | "command"
  | "cases"
  | "impact"
  | "decision";

type CaseItem = {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  confidence: number;
  status: string;
  ai_summary: string;
  root_cause: any[];
  recommendation: string;
  created_at: string;
};

type DocumentItem = {
  id: number;
  name: string;
  file_type: string;
  created_at: string;
};

type Decision = {
  id: number;
  title: string;
  action: string;
  recommendation: string;
  risk: number;
  status: string;
  approved_by?: string;
  created_at: string;
  decided_at?: string;
};

type Pattern = {
  id: number;
  title: string;
  description: string;
  confidence: number;
  severity: string;
  case_count: number;
  status: string;
};

type SimulationOption = {
  name: string;
  risk: number;
  impact: number;
  confidence: number;
  affected_areas: string[];
  consequences: string[];
  required_actions: string[];
  reason: string;
};

type SimulationResult = {
  options: SimulationOption[];
  recommended_option: string;
  recommendation_reason: string;
  overall_risk: number;
};

type Dashboard = {
  system_score: number;
  documents: number;
  cases: number;
  open_cases: number;
  patterns: number;
  pending_decisions: number;
  conflicts: number;
  impacts: number;
  outcomes: number;
  pulse: {
    urgent_cases: number;
    emerging_patterns: number;
    knowledge_risks: number;
    decisions_waiting: number;
  };
};

type AuditLog = {
  id: number;
  actor: string;
  role: string;
  action: string;
  target_type: string;
  target_id?: number;
  details: string;
  created_at: string;
};

async function api<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(
    `${API}${path}`,
    options
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      body || `Request failed: ${response.status}`
    );
  }

  return response.json();
}


function App() {
  const [view, setView] =
    useState<View>("command");

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [dashboard, setDashboard] =
    useState<Dashboard | null>(null);

  const [cases, setCases] =
    useState<CaseItem[]>([]);

  const [documents, setDocuments] =
    useState<DocumentItem[]>([]);

  const [patterns, setPatterns] =
    useState<Pattern[]>([]);

  const [decisions, setDecisions] =
    useState<Decision[]>([]);

  const [auditLogs, setAuditLogs] =
    useState<AuditLog[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [patternScanning, setPatternScanning] =
    useState(false);

  const [conflictScanning, setConflictScanning] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [selectedCase, setSelectedCase] =
    useState<CaseItem | null>(null);

  const [selectedDecision, setSelectedDecision] =
    useState<Decision | null>(null);

  const [showNewCase, setShowNewCase] =
    useState(false);

  const [showOutcome, setShowOutcome] =
    useState(false);

  const [caseForm, setCaseForm] = useState({
    title: "",
    description: "",
    category: "Operational",
  });

  const [impactForm, setImpactForm] = useState({
    title: "",
    scenario: "",
  });

  const [simulation, setSimulation] =
    useState<SimulationResult | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [manager, setManager] =
    useState("Manager");

  const [pin, setPin] =
    useState("");

  const [outcomeForm, setOutcomeForm] =
    useState({
      metric: "",
      before_value: "",
      after_value: "",
      unit: "",
      result: "",
    });


  async function loadAll() {
    try {
      setLoading(true);

      const [
        dash,
        caseData,
        docs,
        patternData,
        decisionData,
        auditData,
      ] = await Promise.all([
        api<Dashboard>("/dashboard"),
        api<CaseItem[]>("/cases"),
        api<DocumentItem[]>("/documents"),
        api<Pattern[]>("/patterns"),
        api<Decision[]>("/decisions"),
        api<AuditLog[]>("/audit"),
      ]);

      setDashboard(dash);
      setCases(caseData);
      setDocuments(docs);
      setPatterns(patternData);
      setDecisions(decisionData);
      setAuditLogs(auditData);

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to connect to RIPPLE backend."
      );

    } finally {

      setLoading(false);

    }
  }


  useEffect(() => {
    loadAll();
  }, []);


  async function createCase() {

    if (
      !caseForm.title.trim() ||
      !caseForm.description.trim()
    ) {
      setError(
        "Please enter a problem title and description."
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api("/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(caseForm),
      });

      setCaseForm({
        title: "",
        description: "",
        category: "Operational",
      });

      setShowNewCase(false);

      await loadAll();

      setView("cases");

      setSuccess(
        "Investigation created successfully."
      );

    } catch (err: any) {

      console.error(
        "RIPPLE: Create case failed:",
        err
      );

      setError(
        err?.message ||
        "Unable to create investigation."
      );

    } finally {

      setLoading(false);

    }
  }


  /*
   * ========================================================
   * PATTERN DETECTION
   * ========================================================
   */

  async function detectPatterns() {

    console.log(
      "RIPPLE: Detect Patterns clicked"
    );

    try {

      setPatternScanning(true);
      setError("");
      setSuccess("");

      console.log(
        "RIPPLE: POST /patterns/detect"
      );

      const result = await api<{
        count: number;
        patterns: any[];
      }>(
        "/patterns/detect",
        {
          method: "POST",
        }
      );

      console.log(
        "RIPPLE: Pattern result:",
        result
      );

      await loadAll();

      if (result.count === 0) {

        setSuccess(
          "Pattern scan completed. No recurring patterns were detected yet."
        );

      } else {

        setSuccess(
          `${result.count} pattern${
            result.count === 1
              ? ""
              : "s"
          } detected successfully.`
        );

      }

    } catch (err: any) {

      console.error(
        "RIPPLE: Pattern detection failed:",
        err
      );

      setError(
        err?.message ||
        "Pattern detection failed."
      );

    } finally {

      setPatternScanning(false);

    }
  }


  async function runSimulation() {

    if (
      !impactForm.title.trim() ||
      !impactForm.scenario.trim()
    ) {

      setError(
        "Enter a problem and proposed change first."
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");
      setSimulation(null);

      const result =
        await api<SimulationResult>(
          "/simulate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              impactForm
            ),
          }
        );

      setSimulation(result);

      setSuccess(
        "RIPPLE simulation completed."
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Simulation failed."
      );

    } finally {

      setLoading(false);

    }
  }


  async function sendToDecision(
    option: SimulationOption
  ) {

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api("/decisions", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          title:
            impactForm.title ||
            "RIPPLE Simulation Decision",

          action: option.name,

          recommendation:
            option.reason,

          risk: option.risk,
        }),
      });

      await loadAll();

      setView("decision");

      setSuccess(
        "Simulation option sent to Decision Room."
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to create decision."
      );

    } finally {

      setLoading(false);

    }
  }


  async function approveDecision() {

    if (
      !selectedDecision ||
      pin.length !== 4
    ) {
      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api(
        "/decisions/approve",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            decision_id:
              selectedDecision.id,
            manager,
            pin,
          }),
        }
      );

      setPin("");
      setSelectedDecision(null);

      await loadAll();

      setSuccess(
        "Decision authorized successfully."
      );

    } catch (err: any) {

      setError(
        "Authorization failed. Demo approval PIN: 2468"
      );

    } finally {

      setLoading(false);

    }
  }


  async function rejectDecision(
    decisionId: number
  ) {

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api(
        `/decisions/${decisionId}/reject`,
        {
          method: "POST",
        }
      );

      setSelectedDecision(null);

      await loadAll();

      setSuccess(
        "Decision rejected."
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to reject decision."
      );

    } finally {

      setLoading(false);

    }
  }


  async function recordOutcome() {

    if (!selectedDecision) {
      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api("/outcomes", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          decision_id:
            selectedDecision.id,

          metric:
            outcomeForm.metric,

          before_value:
            Number(
              outcomeForm.before_value
            ),

          after_value:
            Number(
              outcomeForm.after_value
            ),

          unit:
            outcomeForm.unit,

          result:
            outcomeForm.result,
        }),
      });

      setShowOutcome(false);

      setOutcomeForm({
        metric: "",
        before_value: "",
        after_value: "",
        unit: "",
        result: "",
      });

      await loadAll();

      setSuccess(
        "Outcome recorded successfully."
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to record outcome."
      );

    } finally {

      setLoading(false);

    }
  }


  async function uploadDocument(
    event: React.ChangeEvent<HTMLInputElement>
  ) {

    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    try {

      setUploading(true);
      setError("");
      setSuccess("");

      const form =
        new FormData();

      form.append(
        "file",
        file
      );

      await api(
        "/upload",
        {
          method: "POST",
          body: form,
        }
      );

      await loadAll();

      setSuccess(
        `${file.name} uploaded and processed.`
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to upload document."
      );

    } finally {

      setUploading(false);

      event.target.value = "";
    }
  }


  async function detectConflicts() {

    console.log(
      "RIPPLE: Detect Conflicts clicked"
    );

    try {

      setConflictScanning(true);
      setError("");
      setSuccess("");

      const result =
        await api<{
          count: number;
        }>(
          "/conflicts/detect",
          {
            method: "POST",
          }
        );

      await loadAll();

      setSuccess(
        `${result.count} conflict${
          result.count === 1
            ? ""
            : "s"
        } detected.`
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Conflict detection failed."
      );

    } finally {

      setConflictScanning(false);

    }
  }


  const urgentCases =
    useMemo(
      () =>
        cases.filter(
          (item) =>
            item.priority ===
              "Immediate" ||
            item.priority ===
              "Critical"
        ),
      [cases]
    );


  function navigate(
    next: View
  ) {

    setView(next);

    setMenuOpen(false);

    setError("");

    setSuccess("");
  }


  return (
    <div className="app-shell">

      <aside
        className={`sidebar ${
          menuOpen
            ? "sidebar-open"
            : ""
        }`}
      >

        <div className="brand">

          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>

          <div>
            <h1>RIPPLE</h1>
            <p>
              Decision Intelligence
            </p>
          </div>

        </div>

        <div className="side-label">
          WORKSPACE
        </div>

        <nav>

          <NavButton
            active={
              view === "command"
            }
            icon={
              <Activity size={18} />
            }
            label="Command Center"
            onClick={() =>
              navigate("command")
            }
          />

          <NavButton
            active={
              view === "cases"
            }
            icon={
              <CircleAlert
                size={18}
              />
            }
            label="Cases"
            badge={
              dashboard?.open_cases
                ? String(
                    dashboard.open_cases
                  )
                : undefined
            }
            onClick={() =>
              navigate("cases")
            }
          />

          <NavButton
            active={
              view === "impact"
            }
            icon={
              <Network size={18} />
            }
            label="Impact Lab"
            onClick={() =>
              navigate("impact")
            }
          />

          <NavButton
            active={
              view === "decision"
            }
            icon={
              <ShieldCheck
                size={18}
              />
            }
            label="Decision Room"
            badge={
              dashboard?.pending_decisions
                ? String(
                    dashboard.pending_decisions
                  )
                : undefined
            }
            onClick={() =>
              navigate("decision")
            }
          />

        </nav>

        <div className="sidebar-bottom">

          <div className="system-mini">

            <div className="mini-pulse" />

            <div>
              <strong>
                RIPPLE ONLINE
              </strong>

              <span>
                AI engine connected
              </span>
            </div>

          </div>

          <div className="profile">

            <div className="avatar">
              M
            </div>

            <div>
              <strong>
                Manager
              </strong>

              <span>
                Decision authority
              </span>
            </div>

            <LogOut size={15} />

          </div>

        </div>

      </aside>


      <main className="main">

        <header className="topbar">

          <button
            className="mobile-menu"
            onClick={() =>
              setMenuOpen(
                !menuOpen
              )
            }
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">

            RIPPLE

            <ChevronRight
              size={14}
            />

            <strong>
              {view ===
              "command"
                ? "Command Center"
                : view === "cases"
                ? "Cases"
                : view === "impact"
                ? "Impact Lab"
                : "Decision Room"}
            </strong>

          </div>

          <div className="top-actions">

            <button
              className="icon-button"
              onClick={loadAll}
              title="Refresh"
            >
              <RefreshCw
                size={17}
                className={
                  loading
                    ? "spin"
                    : ""
                }
              />
            </button>

            <button
              className="primary-button"
              onClick={() =>
                setShowNewCase(
                  true
                )
              }
            >
              <Plus size={17} />
              New Investigation
            </button>

          </div>

        </header>


        {error && (
          <div className="error-banner">

            <AlertTriangle
              size={17}
            />

            <span>
              {error}
            </span>

            <button
              onClick={() =>
                setError("")
              }
            >
              <X size={16} />
            </button>

          </div>
        )}


        {success && (
          <div className="success-banner">

            <Check size={17} />

            <span>
              {success}
            </span>

            <button
              onClick={() =>
                setSuccess("")
              }
            >
              <X size={16} />
            </button>

          </div>
        )}


        {view ===
          "command" && (
          <CommandCenter
            dashboard={dashboard}
            cases={cases}
            patterns={patterns}
            decisions={decisions}
            documents={documents}
            urgentCases={
              urgentCases
            }
            onNavigate={navigate}
            onDetectPatterns={
              detectPatterns
            }
            onDetectConflicts={
              detectConflicts
            }
            onUpload={
              uploadDocument
            }
            uploading={uploading}
            patternScanning={
              patternScanning
            }
            conflictScanning={
              conflictScanning
            }
            auditLogs={auditLogs}
          />
        )}


        {view === "cases" && (
          <CasesPage
            cases={cases}
            selectedCase={
              selectedCase
            }
            onSelect={
              setSelectedCase
            }
            onNew={() =>
              setShowNewCase(
                true
              )
            }
            onDetectPatterns={
              detectPatterns
            }
            patternScanning={
              patternScanning
            }
          />
        )}


        {view === "impact" && (
          <ImpactLab
            form={impactForm}
            setForm={
              setImpactForm
            }
            onRun={
              runSimulation
            }
            simulation={
              simulation
            }
            onDecision={
              sendToDecision
            }
            loading={loading}
            documents={
              documents
            }
          />
        )}


        {view ===
          "decision" && (
          <DecisionRoom
            decisions={
              decisions
            }
            selected={
              selectedDecision
            }
            setSelected={
              setSelectedDecision
            }
            manager={manager}
            setManager={
              setManager
            }
            pin={pin}
            setPin={setPin}
            onApprove={
              approveDecision
            }
            onReject={
              rejectDecision
            }
            onOutcome={() =>
              setShowOutcome(
                true
              )
            }
            loading={loading}
          />
        )}

      </main>


      {showNewCase && (
        <Modal
          title="Start AI Investigation"
          subtitle="Describe the problem. RIPPLE will investigate the available evidence and organizational knowledge."
          onClose={() =>
            setShowNewCase(
              false
            )
          }
        >

          <div className="form-grid">

            <label>
              Problem title

              <input
                value={
                  caseForm.title
                }
                onChange={(e) =>
                  setCaseForm({
                    ...caseForm,
                    title:
                      e.target.value,
                  })
                }
                placeholder="e.g. Order processing delays increased"
              />
            </label>


            <label>
              Category

              <select
                value={
                  caseForm.category
                }
                onChange={(e) =>
                  setCaseForm({
                    ...caseForm,
                    category:
                      e.target.value,
                  })
                }
              >
                <option>
                  Operational
                </option>

                <option>
                  Process
                </option>

                <option>
                  Technology
                </option>

                <option>
                  Customer
                </option>

                <option>
                  Compliance
                </option>

                <option>
                  Security
                </option>

                <option>
                  Other
                </option>

              </select>

            </label>


            <label className="full">

              What happened?

              <textarea
                value={
                  caseForm.description
                }
                onChange={(e) =>
                  setCaseForm({
                    ...caseForm,
                    description:
                      e.target.value,
                  })
                }
                placeholder="Describe the problem, observed signals, affected areas, and anything already known..."
                rows={7}
              />

            </label>

          </div>


          <div className="modal-actions">

            <button
              className="secondary-button"
              onClick={() =>
                setShowNewCase(
                  false
                )
              }
            >
              Cancel
            </button>


            <button
              className="primary-button"
              onClick={
                createCase
              }
              disabled={loading}
            >

              <Sparkles
                size={17}
              />

              {loading
                ? "Investigating..."
                : "Investigate with AI"}

            </button>

          </div>

        </Modal>
      )}


      {showOutcome &&
        selectedDecision && (
          <Modal
            title="Measure the Result"
            subtitle="Close the decision loop by recording what changed after execution."
            onClose={() =>
              setShowOutcome(
                false
              )
            }
          >

            <div className="form-grid">

              <label>
                Metric

                <input
                  value={
                    outcomeForm.metric
                  }
                  onChange={(e) =>
                    setOutcomeForm({
                      ...outcomeForm,
                      metric:
                        e.target.value,
                    })
                  }
                  placeholder="Processing time"
                />
              </label>


              <label>
                Unit

                <input
                  value={
                    outcomeForm.unit
                  }
                  onChange={(e) =>
                    setOutcomeForm({
                      ...outcomeForm,
                      unit:
                        e.target.value,
                    })
                  }
                  placeholder="minutes"
                />
              </label>


              <label>
                Before

                <input
                  type="number"
                  value={
                    outcomeForm.before_value
                  }
                  onChange={(e) =>
                    setOutcomeForm({
                      ...outcomeForm,
                      before_value:
                        e.target.value,
                    })
                  }
                />
              </label>


              <label>
                After

                <input
                  type="number"
                  value={
                    outcomeForm.after_value
                  }
                  onChange={(e) =>
                    setOutcomeForm({
                      ...outcomeForm,
                      after_value:
                        e.target.value,
                    })
                  }
                />
              </label>


              <label className="full">

                Result note

                <textarea
                  value={
                    outcomeForm.result
                  }
                  onChange={(e) =>
                    setOutcomeForm({
                      ...outcomeForm,
                      result:
                        e.target.value,
                    })
                  }
                  rows={4}
                  placeholder="What happened after the intervention?"
                />

              </label>

            </div>


            <div className="modal-actions">

              <button
                className="secondary-button"
                onClick={() =>
                  setShowOutcome(
                    false
                  )
                }
              >
                Cancel
              </button>


              <button
                className="primary-button"
                onClick={
                  recordOutcome
                }
              >

                <TrendingUp
                  size={17}
                />

                Record Outcome

              </button>

            </div>

          </Modal>
        )}

    </div>
  );
}


/* ============================================================
   COMMAND CENTER
   ============================================================ */

function CommandCenter({
  dashboard,
  patterns,
  documents,
  urgentCases,
  onNavigate,
  onDetectPatterns,
  onDetectConflicts,
  onUpload,
  uploading,
  patternScanning,
  conflictScanning,
  auditLogs,
}: {
  dashboard: Dashboard | null;
  cases: CaseItem[];
  patterns: Pattern[];
  decisions: Decision[];
  documents: DocumentItem[];
  urgentCases: CaseItem[];
  onNavigate: (
    view: View
  ) => void;
  onDetectPatterns: () => void;
  onDetectConflicts: () => void;
  onUpload: (
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  uploading: boolean;
  patternScanning: boolean;
  conflictScanning: boolean;
  auditLogs: AuditLog[];
}) {

  const score =
    dashboard?.system_score ?? 0;

  return (
    <div className="page">

      <section className="hero">

        <div>

          <div className="eyebrow">

            <span className="live-dot" />

            LIVE ORGANIZATIONAL
            INTELLIGENCE

          </div>


          <h2>
            See the problem.
            <br />
            <span>
              Understand the ripple.
            </span>
          </h2>


          <p>
            RIPPLE connects evidence,
            knowledge, patterns and
            possible consequences so
            decision-makers can act
            with context.
          </p>


          <div className="hero-actions">

            <button
              className="primary-button large"
              onClick={() =>
                onNavigate(
                  "impact"
                )
              }
            >
              <Zap size={18} />
              Open Impact Lab
            </button>


            <button
              className="secondary-button large"
              onClick={() =>
                onNavigate(
                  "cases"
                )
              }
            >
              <Brain size={18} />
              Investigate a Problem
            </button>

          </div>

        </div>


        <div className="score-card">

          <div className="score-ring">

            <div>
              <strong>
                {score}
              </strong>

              <span>
                /100
              </span>
            </div>

          </div>


          <div>

            <span className="muted">
              System Pulse
            </span>

            <h3>
              {score >= 80
                ? "Healthy intelligence"
                : score >= 60
                ? "Needs attention"
                : "High risk"}
            </h3>

            <p>
              Based on knowledge risks,
              decisions and active
              operational signals.
            </p>

          </div>

        </div>

      </section>


      <section className="stat-grid">

        <MetricCard
          icon={
            <CircleAlert />
          }
          label="Open Cases"
          value={
            dashboard?.open_cases ??
            0
          }
          sub="requiring investigation"
          accent="danger"
        />


        <MetricCard
          icon={
            <GitBranch />
          }
          label="Emerging Patterns"
          value={
            dashboard?.patterns ??
            0
          }
          sub="signals detected"
          accent="purple"
        />


        <MetricCard
          icon={
            <AlertTriangle />
          }
          label="Knowledge Risks"
          value={
            dashboard?.conflicts ??
            0
          }
          sub="potential conflicts"
          accent="warning"
        />


        <MetricCard
          icon={
            <ShieldCheck />
          }
          label="Decisions Waiting"
          value={
            dashboard?.pending_decisions ??
            0
          }
          sub="manager action required"
          accent="green"
        />

      </section>


      <div className="dashboard-grid">

        <section className="panel attention-panel">

          <PanelHeader
            title="Needs Attention"
            subtitle="Signals RIPPLE thinks deserve review"
            icon={
              <Target size={18} />
            }
            action={
              <button
                className="text-button"
                onClick={() =>
                  onNavigate(
                    "cases"
                  )
                }
              >
                View all
                <ArrowRight
                  size={14}
                />
              </button>
            }
          />


          {urgentCases.length ===
          0 ? (

            <EmptyState
              icon={
                <Check />
              }
              title="No immediate cases"
              text="RIPPLE has no critical operational signals right now."
            />

          ) : (

            <div className="attention-list">

              {urgentCases
                .slice(0, 5)
                .map(
                  (item) => (

                    <div
                      className="attention-row"
                      key={
                        item.id
                      }
                    >

                      <div className="attention-icon">
                        <AlertTriangle
                          size={17}
                        />
                      </div>


                      <div className="attention-main">

                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {item.ai_summary ||
                            item.description}
                        </span>

                      </div>


                      <div className="attention-score">

                        {Math.round(
                          item.confidence
                        )}
                        %

                      </div>

                    </div>

                  )
                )}

            </div>
          )}

        </section>


        <section className="panel pulse-panel">

          <PanelHeader
            title="RIPPLE Pulse"
            subtitle="Current intelligence flow"
            icon={
              <Activity size={18} />
            }
          />


          <div className="pulse-map">

            <PulseNode
              icon={
                <CircleAlert />
              }
              label="Problems"
              value={
                dashboard?.cases ??
                0
              }
            />

            <PulseArrow />


            <PulseNode
              icon={
                <Brain />
              }
              label="Patterns"
              value={
                dashboard?.patterns ??
                0
              }
            />

            <PulseArrow />


            <PulseNode
              icon={
                <Network />
              }
              label="Connections"
              value={
                dashboard?.impacts ??
                0
              }
            />

            <PulseArrow />


            <PulseNode
              icon={
                <ShieldCheck />
              }
              label="Decisions"
              value={
                dashboard?.pending_decisions ??
                0
              }
            />

          </div>

        </section>

      </div>


      <div className="dashboard-grid lower">

        <section className="panel">

          <PanelHeader
            title="Emerging Intelligence"
            subtitle="Recurring signals across investigations"
            icon={
              <GitBranch size={18} />
            }
            action={

              <button
                type="button"
                className="secondary-small"
                onClick={() => {
                  console.log(
                    "RIPPLE: Scan patterns button clicked"
                  );

                  onDetectPatterns();
                }}
                disabled={
                  patternScanning
                }
              >

                <RefreshCw
                  size={14}
                  className={
                    patternScanning
                      ? "spin"
                      : ""
                  }
                />

                {patternScanning
                  ? "Scanning..."
                  : "Scan patterns"}

              </button>

            }
          />


          {patterns.length ===
          0 ? (

            <EmptyState
              icon={
                <Search />
              }
              title="No patterns yet"
              text="Run pattern detection after adding several cases."
            />

          ) : (

            <div className="pattern-list">

              {patterns
                .slice(0, 4)
                .map(
                  (pattern) => (

                    <div
                      className="pattern-item"
                      key={
                        pattern.id
                      }
                    >

                      <div className="pattern-icon">
                        <GitBranch
                          size={16}
                        />
                      </div>


                      <div>

                        <strong>
                          {pattern.title}
                        </strong>

                        <p>
                          {pattern.description}
                        </p>

                        <div className="pattern-meta">

                          <span>
                            {pattern.case_count} cases
                          </span>

                          <span>
                            {Math.round(
                              pattern.confidence
                            )}
                            % confidence
                          </span>

                        </div>

                      </div>

                    </div>

                  )
                )}

            </div>

          )}

        </section>


        <section className="panel">

          <PanelHeader
            title="Knowledge & Evidence"
            subtitle="The context RIPPLE can reason over"
            icon={
              <Layers3 size={18} />
            }
          />


          <div className="knowledge-number">

            <strong>
              {documents.length}
            </strong>

            <span>
              knowledge sources
            </span>

          </div>


          <div className="knowledge-actions">

            <label className="upload-zone">

              <Upload size={18} />

              <span>
                {uploading
                  ? "Processing..."
                  : "Upload PDF / DOCX / TXT"}
              </span>


              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={
                  onUpload
                }
                hidden
                disabled={
                  uploading
                }
              />

            </label>


            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                console.log(
                  "RIPPLE: Scan conflicts button clicked"
                );

                onDetectConflicts();
              }}
              disabled={
                conflictScanning
              }
            >

              <AlertTriangle
                size={16}
              />

              {conflictScanning
                ? "Scanning..."
                : "Scan conflicts"}

            </button>

          </div>

        </section>

      </div>


      <section className="panel activity-panel">

        <PanelHeader
          title="Recent System Activity"
          subtitle="Auditable actions inside RIPPLE"
          icon={
            <Clock3 size={18} />
          }
        />


        {auditLogs.length ===
        0 ? (

          <EmptyState
            icon={
              <Activity />
            }
            title="No activity yet"
            text="RIPPLE activity will appear here."
          />

        ) : (

          <div className="activity-list">

            {auditLogs
              .slice(0, 8)
              .map(
                (log) => (

                  <div
                    className="activity-row"
                    key={
                      log.id
                    }
                  >

                    <div className="activity-dot" />


                    <div>

                      <strong>
                        {formatAction(
                          log.action
                        )}
                      </strong>

                      <span>
                        {log.details ||
                          `${log.target_type} ${log.target_id || ""}`}
                      </span>

                    </div>


                    <time>
                      {formatDate(
                        log.created_at
                      )}
                    </time>

                  </div>

                )
              )}

          </div>

        )}

      </section>

    </div>
  );
}


/* ============================================================
   CASES
   ============================================================ */

function CasesPage({
  cases,
  selectedCase,
  onSelect,
  onNew,
  onDetectPatterns,
  patternScanning,
}: {
  cases: CaseItem[];
  selectedCase: CaseItem | null;
  onSelect: (
    item: CaseItem | null
  ) => void;
  onNew: () => void;
  onDetectPatterns: () => void;
  patternScanning: boolean;
}) {

  const groups = [
    "Immediate",
    "High",
    "Review",
    "Low",
  ];

  return (
    <div className="page">

      <PageTitle
        eyebrow="INVESTIGATION"
        title="Cases"
        description="Turn operational problems into structured investigations with evidence, hypotheses and recommended actions."
        action={
          <button
            className="primary-button"
            onClick={onNew}
          >
            <Plus size={17} />
            New Investigation
          </button>
        }
      />


      <div className="case-toolbar">

        <div className="search-box">

          <Search size={16} />

          <input
            placeholder="Search investigations..."
          />

        </div>


        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            console.log(
              "RIPPLE: Detect Patterns button clicked"
            );

            onDetectPatterns();
          }}
          disabled={
            patternScanning
          }
        >

          <GitBranch
            size={16}
            className={
              patternScanning
                ? "spin"
                : ""
            }
          />

          {patternScanning
            ? "Detecting..."
            : "Detect Patterns"}

        </button>

      </div>


      <div className="case-columns">

        {groups.map(
          (group) => {

            const items =
              cases.filter(
                (item) =>
                  normalizePriority(
                    item.priority
                  ) === group
              );

            return (
              <section
                className="case-column"
                key={group}
              >

                <div className="column-header">

                  <div>

                    <span
                      className={`priority-dot ${priorityClass(
                        group
                      )}`}
                    />

                    <strong>
                      {group}
                    </strong>

                  </div>

                  <span>
                    {items.length}
                  </span>

                </div>


                {items.length ===
                0 ? (

                  <div className="empty-column">
                    No cases
                  </div>

                ) : (

                  items.map(
                    (item) => (

                      <button
                        className="case-card"
                        key={
                          item.id
                        }
                        onClick={() =>
                          onSelect(
                            item
                          )
                        }
                      >

                        <div className="case-card-top">

                          <span
                            className={`priority-badge ${priorityClass(
                              item.priority
                            )}`}
                          >
                            {
                              item.priority
                            }
                          </span>

                          <span>
                            #
                            {String(
                              item.id
                            ).padStart(
                              4,
                              "0"
                            )}
                          </span>

                        </div>


                        <h3>
                          {item.title}
                        </h3>


                        <p>
                          {item.ai_summary ||
                            item.description}
                        </p>


                        <div className="case-card-bottom">

                          <span>
                            {
                              item.category
                            }
                          </span>

                          <span>
                            AI{" "}
                            {Math.round(
                              item.confidence
                            )}
                            %
                          </span>

                        </div>

                      </button>

                    )
                  )

                )}

              </section>
            );

          }
        )}

      </div>


      {selectedCase && (
        <CaseDrawer
          item={
            selectedCase
          }
          onClose={() =>
            onSelect(null)
          }
        />
      )}

    </div>
  );
}


/* ============================================================
   CASE DRAWER
   ============================================================ */

function CaseDrawer({
  item,
  onClose,
}: {
  item: CaseItem;
  onClose: () => void;
}) {

  let causes =
    item.root_cause;

  if (
    !Array.isArray(
      causes
    )
  ) {
    causes = [];
  }

  return (
    <div className="drawer-backdrop">

      <div className="case-drawer">

        <div className="drawer-header">

          <div>

            <span className="eyebrow">
              INVESTIGATION #
              {item.id}
            </span>

            <h2>
              {item.title}
            </h2>

          </div>


          <button
            className="icon-button"
            onClick={onClose}
          >
            <X size={18} />
          </button>

        </div>


        <div className="drawer-content">

          <div className="case-intelligence">

            <IntelligenceStep
              number="01"
              icon={
                <CircleAlert />
              }
              title="What happened?"
              text={
                item.description
              }
            />


            <IntelligenceStep
              number="02"
              icon={
                <Brain />
              }
              title="AI understanding"
              text={
                item.ai_summary ||
                "RIPPLE is analyzing the available context."
              }
            />


            <div className="confidence-box">

              <div>

                <span>
                  AI confidence
                </span>

                <strong>
                  {Math.round(
                    item.confidence
                  )}
                  %
                </strong>

              </div>


              <div className="confidence-bar">

                <span
                  style={{
                    width: `${Math.min(
                      100,
                      item.confidence
                    )}%`,
                  }}
                />

              </div>

            </div>


            <IntelligenceStep
              number="03"
              icon={
                <Lightbulb />
              }
              title="Possible root causes"
              text=""
            />


            <div className="cause-list">

              {causes.length ===
              0 ? (

                <div className="small-empty">
                  No root-cause hypotheses
                  available yet.
                </div>

              ) : (

                causes.map(
                  (
                    cause: any,
                    index: number
                  ) => (

                    <div
                      className="cause-card"
                      key={
                        index
                      }
                    >

                      <div className="cause-number">
                        H
                        {index + 1}
                      </div>


                      <div>

                        <strong>
                          {cause.hypothesis ||
                            cause.title ||
                            "Possible cause"}
                        </strong>


                        {cause.evidence && (
                          <p>
                            {
                              cause.evidence
                            }
                          </p>
                        )}


                        {cause.confidence !=
                          null && (
                          <span>
                            {Math.round(
                              Number(
                                cause.confidence
                              )
                            )}
                            % confidence
                          </span>
                        )}

                      </div>

                    </div>

                  )
                )

              )}

            </div>


            <IntelligenceStep
              number="04"
              icon={
                <Target />
              }
              title="Recommended action"
              text={
                item.recommendation ||
                "No recommendation available."
              }
              final
            />

          </div>

        </div>


        <div className="drawer-footer">

          <button
            className="secondary-button"
            onClick={onClose}
          >
            Close
          </button>

        </div>

      </div>

    </div>
  );
}


/* ============================================================
   IMPACT LAB
   ============================================================ */

function ImpactLab({
  form,
  setForm,
  onRun,
  simulation,
  onDecision,
  loading,
  documents,
}: {
  form: {
    title: string;
    scenario: string;
  };

  setForm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      scenario: string;
    }>
  >;

  onRun: () => void;

  simulation:
    | SimulationResult
    | null;

  onDecision: (
    option: SimulationOption
  ) => void;

  loading: boolean;

  documents:
    DocumentItem[];
}) {

  return (
    <div className="page">

      <PageTitle
        eyebrow="SIMULATION ENGINE"
        title="Impact Lab"
        description="Ask RIPPLE what could happen before you make the change."
      />


      <section className="what-if-card">

        <div className="what-if-header">

          <div className="what-if-icon">

            <Zap size={23} />

          </div>


          <div>

            <span>
              WHAT IF?
            </span>

            <h2>
              Simulate a decision
            </h2>

          </div>

        </div>


        <div className="simulation-form">

          <label>

            Problem / decision

            <input
              value={
                form.title
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  title:
                    e.target.value,
                })
              }
              placeholder="e.g. Order processing delays increased 38%"
            />

          </label>


          <label>

            Proposed change

            <textarea
              value={
                form.scenario
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  scenario:
                    e.target.value,
                })
              }
              placeholder="e.g. What if we introduce a controlled automated approval step?"
              rows={5}
            />

          </label>


          <div className="simulation-footer">

            <div className="context-info">

              <Layers3 size={16} />

              <span>

                Simulation context:

                <strong>
                  {documents.length}
                </strong>{" "}
                knowledge sources

              </span>

            </div>


            <button
              className="primary-button large"
              onClick={onRun}
              disabled={loading}
            >

              <Play size={17} />

              {loading
                ? "Simulating..."
                : "Run RIPPLE Simulation"}

            </button>

          </div>

        </div>

      </section>


      {simulation && (
        <section className="simulation-result">

          <div className="simulation-title">

            <div>

              <span className="eyebrow">
                RIPPLE SIMULATION COMPLETE
              </span>

              <h2>
                Possible paths forward
              </h2>

              <p>
                These are estimated consequences,
                not guaranteed outcomes.
              </p>

            </div>


            <div className="overall-risk">

              <span>
                Overall risk
              </span>

              <strong>
                {Math.round(
                  simulation.overall_risk
                )}
              </strong>

              <small>
                /100
              </small>

            </div>

          </div>


          <div className="option-grid">

            {simulation.options.map(
              (
                option,
                index
              ) => {

                const recommended =
                  option.name ===
                  simulation.recommended_option;

                return (
                  <div
                    className={`option-card ${
                      recommended
                        ? "recommended"
                        : ""
                    }`}
                    key={index}
                  >

                    {recommended && (
                      <div className="recommended-label">

                        <Sparkles
                          size={13}
                        />

                        RIPPLE RECOMMENDS

                      </div>
                    )}


                    <div className="option-number">

                      OPTION{" "}
                      {String(
                        index + 1
                      ).padStart(
                        2,
                        "0"
                      )}

                    </div>


                    <h3>
                      {option.name}
                    </h3>


                    <div className="option-metrics">

                      <RiskMetric
                        label="Risk"
                        value={
                          option.risk
                        }
                      />

                      <RiskMetric
                        label="Impact"
                        value={
                          option.impact
                        }
                      />

                      <RiskMetric
                        label="Confidence"
                        value={
                          option.confidence
                        }
                      />

                    </div>


                    <p className="option-reason">
                      {
                        option.reason
                      }
                    </p>


                    <div className="affected-list">

                      <span>
                        AFFECTED AREAS
                      </span>

                      {option.affected_areas
                        .slice(0, 4)
                        .map(
                          (
                            area,
                            areaIndex
                          ) => (

                            <div
                              key={
                                areaIndex
                              }
                            >

                              <Network
                                size={13}
                              />

                              {area}

                            </div>

                          )
                        )}

                    </div>


                    <div className="consequence-list">

                      <span>
                        POSSIBLE CONSEQUENCES
                      </span>

                      {option.consequences
                        .slice(0, 3)
                        .map(
                          (
                            consequence,
                            consequenceIndex
                          ) => (

                            <div
                              key={
                                consequenceIndex
                              }
                            >

                              <ChevronRight
                                size={13}
                              />

                              {
                                consequence
                              }

                            </div>

                          )
                        )}

                    </div>


                    <button
                      className={
                        recommended
                          ? "primary-button full-button"
                          : "secondary-button full-button"
                      }
                      onClick={() =>
                        onDecision(
                          option
                        )
                      }
                    >

                      Send to Decision Room

                      <ArrowRight
                        size={15}
                      />

                    </button>

                  </div>
                );
              }
            )}

          </div>


          <div className="recommendation-banner">

            <div className="recommendation-icon">

              <Brain size={21} />

            </div>


            <div>

              <span>
                AI RECOMMENDATION
              </span>

              <strong>
                {
                  simulation.recommended_option
                }
              </strong>

              <p>
                {
                  simulation.recommendation_reason
                }
              </p>

            </div>

          </div>

        </section>
      )}

    </div>
  );
}


/* ============================================================
   DECISION ROOM
   ============================================================ */

function DecisionRoom({
  decisions,
  selected,
  setSelected,
  manager,
  setManager,
  pin,
  setPin,
  onApprove,
  onReject,
  onOutcome,
  loading,
}: {
  decisions: Decision[];
  selected:
    | Decision
    | null;

  setSelected: (
    decision:
      | Decision
      | null
  ) => void;

  manager: string;

  setManager: (
    value: string
  ) => void;

  pin: string;

  setPin: (
    value: string
  ) => void;

  onApprove: () => void;

  onReject: (
    id: number
  ) => void;

  onOutcome: () => void;

  loading: boolean;
}) {

  return (
    <div className="page">

      <PageTitle
        eyebrow="AUTHORIZED DECISIONS"
        title="Decision Room"
        description="AI can recommend. Authorized humans decide."
      />


      <div className="decision-banner">

        <ShieldCheck size={21} />

        <div>

          <strong>
            Human-in-the-loop protection
          </strong>

          <span>
            RIPPLE never executes an official
            operational decision without authorization.
          </span>

        </div>

      </div>


      <div className="decision-layout">

        <section className="decision-list">

          <div className="section-heading">

            <div>

              <h3>
                Decision queue
              </h3>

              <span>
                {
                  decisions.filter(
                    (d) =>
                      d.status ===
                      "pending"
                  ).length
                }{" "}
                awaiting review
              </span>

            </div>

          </div>


          {decisions.length ===
          0 ? (

            <EmptyState
              icon={
                <ShieldCheck />
              }
              title="Decision room is clear"
              text="Run a simulation and send an option here for manager review."
            />

          ) : (

            decisions.map(
              (decision) => (

                <button
                  className={`decision-card ${
                    selected?.id ===
                    decision.id
                      ? "selected"
                      : ""
                  }`}
                  key={
                    decision.id
                  }
                  onClick={() =>
                    setSelected(
                      decision
                    )
                  }
                >

                  <div className="decision-card-top">

                    <span
                      className={`status-pill ${decision.status}`}
                    >
                      {
                        decision.status
                      }
                    </span>

                    <span>
                      D-
                      {String(
                        decision.id
                      ).padStart(
                        4,
                        "0"
                      )}
                    </span>

                  </div>


                  <h3>
                    {
                      decision.title
                    }
                  </h3>


                  <p>
                    {
                      decision.action
                    }
                  </p>


                  <div className="decision-card-bottom">

                    <span>
                      Risk{" "}
                      {Math.round(
                        decision.risk
                      )}
                      /100
                    </span>

                    <ChevronRight
                      size={15}
                    />

                  </div>

                </button>

              )
            )

          )}

        </section>


        <section className="decision-detail">

          {!selected ? (

            <div className="decision-empty">

              <div className="decision-empty-icon">
                <Lock size={27} />
              </div>

              <h2>
                Select a decision
              </h2>

              <p>
                Review the AI recommendation,
                risk and proposed action before
                authorizing execution.
              </p>

            </div>

          ) : (

            <>

              <div className="detail-header">

                <div>

                  <span className="eyebrow">

                    DECISION D-
                    {String(
                      selected.id
                    ).padStart(
                      4,
                      "0"
                    )}

                  </span>

                  <h2>
                    {
                      selected.title
                    }
                  </h2>

                </div>


                <span
                  className={`status-pill ${selected.status}`}
                >
                  {
                    selected.status
                  }
                </span>

              </div>


              <div className="decision-summary-grid">

                <div className="decision-summary">

                  <span>
                    PROPOSED ACTION
                  </span>

                  <strong>
                    {
                      selected.action
                    }
                  </strong>

                </div>


                <div className="decision-summary">

                  <span>
                    ESTIMATED RISK
                  </span>

                  <strong>
                    {Math.round(
                      selected.risk
                    )}
                    /100
                  </strong>

                </div>

              </div>


              <div className="ai-recommendation">

                <div className="recommendation-icon">

                  <Sparkles
                    size={19}
                  />

                </div>


                <div>

                  <span>
                    AI RECOMMENDATION
                  </span>

                  <p>
                    {
                      selected.recommendation ||
                      "Review available evidence before making the decision."
                    }
                  </p>

                </div>

              </div>


              {selected.status ===
              "pending" ? (

                <div className="approval-box">

                  <div className="approval-title">

                    <Lock size={18} />

                    <div>

                      <strong>
                        Manager authorization
                      </strong>

                      <span>
                        Enter the approval credential
                        to authorize execution.
                      </span>

                    </div>

                  </div>


                  <div className="approval-form">

                    <label>

                      Manager

                      <input
                        value={
                          manager
                        }
                        onChange={(
                          e
                        ) =>
                          setManager(
                            e.target
                              .value
                          )
                        }
                      />

                    </label>


                    <label>

                      Approval PIN

                      <input
                        value={
                          pin
                        }
                        maxLength={
                          4
                        }
                        inputMode="numeric"
                        type="password"
                        onChange={(
                          e
                        ) =>
                          setPin(
                            e.target.value.replace(
                              /\D/g,
                              ""
                            )
                          )
                        }
                        placeholder="••••"
                      />

                    </label>

                  </div>


                  <div className="approval-actions">

                    <button
                      className="danger-button"
                      onClick={() =>
                        onReject(
                          selected.id
                        )
                      }
                      disabled={
                        loading
                      }
                    >

                      <X size={16} />

                      Reject

                    </button>


                    <button
                      className="primary-button"
                      onClick={
                        onApprove
                      }
                      disabled={
                        loading ||
                        pin.length !==
                          4
                      }
                    >

                      <Check
                        size={16}
                      />

                      Authorize &
                      Execute

                    </button>

                  </div>


                  <div className="demo-note">

                    Demo authorization PIN:

                    <strong>
                      2468
                    </strong>

                  </div>

                </div>

              ) : (

                <div className="approved-box">

                  <div className="approved-icon">

                    <Check
                      size={21}
                    />

                  </div>


                  <div>

                    <strong>
                      Decision authorized
                    </strong>

                    <span>

                      Approved by{" "}
                      {
                        selected.approved_by ||
                        "Manager"
                      }{" "}
                      on{" "}
                      {formatDate(
                        selected.decided_at
                      )}

                    </span>

                  </div>


                  <button
                    className="secondary-button"
                    onClick={
                      onOutcome
                    }
                  >

                    <BarChart3
                      size={16}
                    />

                    Record Result

                  </button>

                </div>

              )}

            </>

          )}

        </section>

      </div>

    </div>
  );
}


/* ============================================================
   REUSABLE UI
   ============================================================ */

function NavButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
}) {

  return (
    <button
      className={`nav-button ${
        active
          ? "active"
          : ""
      }`}
      onClick={onClick}
    >

      {icon}

      <span>
        {label}
      </span>


      {badge && (
        <b>
          {badge}
        </b>
      )}

    </button>
  );
}


function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  accent: string;
}) {

  return (
    <div className="metric-card">

      <div
        className={`metric-icon ${accent}`}
      >
        {icon}
      </div>


      <div>

        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

        <small>
          {sub}
        </small>

      </div>

    </div>
  );
}


function PanelHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {

  return (
    <div className="panel-header">

      <div className="panel-title">

        <div className="panel-title-icon">
          {icon}
        </div>


        <div>

          <h3>
            {title}
          </h3>

          <span>
            {subtitle}
          </span>

        </div>

      </div>


      {action}

    </div>
  );
}


function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {

  return (
    <div className="page-title">

      <div>

        <span className="eyebrow">
          {eyebrow}
        </span>

        <h2>
          {title}
        </h2>

        <p>
          {description}
        </p>

      </div>


      {action}

    </div>
  );
}


function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {

  return (
    <div className="empty-state">

      <div className="empty-icon">
        {icon}
      </div>

      <strong>
        {title}
      </strong>

      <span>
        {text}
      </span>

    </div>
  );
}


function PulseNode({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {

  return (
    <div className="pulse-node">

      <div>
        {icon}
      </div>

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


function PulseArrow() {

  return (
    <div className="pulse-arrow">
      <ArrowRight
        size={15}
      />
    </div>
  );
}


function IntelligenceStep({
  number,
  icon,
  title,
  text,
  final,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  final?: boolean;
}) {

  return (
    <div
      className={`intelligence-step ${
        final
          ? "final"
          : ""
      }`}
    >

      <div className="step-number">
        {number}
      </div>


      <div className="step-icon">
        {icon}
      </div>


      <div className="step-body">

        <span>
          {title}
        </span>

        {text && (
          <p>
            {text}
          </p>
        )}

      </div>

    </div>
  );
}


function RiskMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {

  const score =
    Math.max(
      0,
      Math.min(
        100,
        value
      )
    );

  return (
    <div className="risk-metric">

      <div>

        <span>
          {label}
        </span>

        <strong>
          {Math.round(
            score
          )}
        </strong>

      </div>


      <div className="risk-bar">

        <span
          style={{
            width: `${score}%`,
          }}
        />

      </div>

    </div>
  );
}


function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {

  return (
    <div className="modal-backdrop">

      <div className="modal">

        <div className="modal-header">

          <div>

            <span className="eyebrow">
              RIPPLE
            </span>

            <h2>
              {title}
            </h2>

            <p>
              {subtitle}
            </p>

          </div>


          <button
            className="icon-button"
            onClick={onClose}
          >
            <X size={18} />
          </button>

        </div>


        <div className="modal-body">
          {children}
        </div>

      </div>

    </div>
  );
}


/* ============================================================
   HELPERS
   ============================================================ */

function normalizePriority(
  priority: string
) {

  const value =
    priority?.toLowerCase() ||
    "";

  if (
    value.includes(
      "critical"
    ) ||
    value.includes(
      "immediate"
    )
  ) {
    return "Immediate";
  }

  if (
    value.includes(
      "high"
    )
  ) {
    return "High";
  }

  if (
    value.includes(
      "low"
    )
  ) {
    return "Low";
  }

  return "Review";
}


function priorityClass(
  priority: string
) {

  const value =
    priority?.toLowerCase() ||
    "";

  if (
    value.includes(
      "critical"
    ) ||
    value.includes(
      "immediate"
    )
  ) {
    return "immediate";
  }

  if (
    value.includes(
      "high"
    )
  ) {
    return "high";
  }

  if (
    value.includes(
      "low"
    )
  ) {
    return "low";
  }

  return "review";
}


function formatDate(
  value?: string
) {

  if (!value) {
    return "—";
  }

  try {

    return new Date(
      value
    ).toLocaleString(
      undefined,
      {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );

  } catch {

    return value;

  }
}


function formatAction(
  value: string
) {

  return value
    .replaceAll(
      "_",
      " "
    )
    .toLowerCase()
    .replace(
      /^\w/,
      (letter) =>
        letter.toUpperCase()
    );
}


export default App;