import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  FileText,
  GitBranch,
  History,
  Home,
  Info,
  Layers3,
  Lock,
  LogOut,
  Menu,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import "./App.css";


/* ============================================================
   CONFIG
   ============================================================ */

const API = "http://127.0.0.1:8000";


/* ============================================================
   TYPES
   ============================================================ */

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
  ai_summary?: string;
  root_cause?: unknown;
  recommendation?: string;
  created_at?: string;
};

type Evidence = {
  id?: number;
  source_type?: string;
  source_id?: number | null;
  title?: string;
  content?: string;
  relevance?: number;
};

type CaseDetail = CaseItem & {
  evidence?: Evidence[];
};

type DocumentItem = {
  id: number;
  name: string;
  file_type: string;
  created_at: string;
};

type Pattern = {
  id?: number;
  title: string;
  description: string;
  confidence: number;
  severity: string;
  case_count: number;
  status?: string;
  created_at?: string;
};

type SimulationOption = {
  name: string;
  risk: number;
  impact: number;
  confidence: number;
  affected_areas: string[];
  consequences: string[];
  required_actions?: string[];
  reason?: string;
};

type SimulationResult = {
  simulation_ids?: number[];
  options: SimulationOption[];
  recommended_option: string;
  recommendation_reason: string;
  overall_risk: number;
};

type Decision = {
  id: number;
  title: string;
  action: string;
  recommendation: string;
  risk: number;
  status: string;
  approved_by?: string | null;
  created_at: string;
  decided_at?: string | null;
  execution_status?: string | null;
  executed_at?: string | null;
  execution_result?: string | null;
};

type AuditLog = {
  id: number;
  actor: string;
  role: string;
  action: string;
  target_type: string;
  target_id?: number | null;
  details: string;
  created_at: string;
};

type Outcome = {
  id: number;
  decision_id: number;
  decision_title?: string;
  metric: string;
  before_value: number;
  after_value: number;
  unit: string;
  result: string;
  recorded_at: string;
};

type Impact = {
  id: number;
  change_id: number;
  document_id: number;
  section_id: number;
  document_name?: string;
  section_no?: number;
  section_content?: string;
  affected: number;
  confidence: number;
  reason: string;
  suggested_fix: string;
  matched_text: string;
  status: string;
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
  executed_decisions?: number;
  pulse?: {
    urgent_cases: number;
    emerging_patterns: number;
    knowledge_risks: number;
    decisions_waiting: number;
  };
};

type KnowledgeHealth = {
  score: number;
  documents: number;
  sections: number;
  impacted_sections: number;
  conflicts: number;
};

type Conflict = {
  id: number;
  document_id: number;
  section_a: number;
  section_b: number;
  topic: string;
  value_a: string;
  value_b: string;
  severity: string;
  explanation: string;
  created_at?: string;
};


/* ============================================================
   API
   ============================================================ */

async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {

  const response = await fetch(
    `${API}${path}`,
    {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : {
              "Content-Type": "application/json",
            }),
        ...(options.headers || {}),
      },
    },
  );

  const text = await response.text();

  let data: any = {};

  try {
    data = text
      ? JSON.parse(text)
      : {};
  } catch {
    data = {
      message: text,
    };
  }

  if (!response.ok) {

    throw new Error(
      data?.detail ||
      data?.message ||
      `Request failed (${response.status})`,
    );
  }

  return data as T;
}


/* ============================================================
   HELPERS
   ============================================================ */

function formatDate(
  value?: string | null,
) {

  if (!value) return "—";

  try {

    return new Date(value).toLocaleString(
      undefined,
      {
        dateStyle: "medium",
        timeStyle: "short",
      },
    );

  } catch {

    return value;
  }
}


function formatShortDate(
  value?: string | null,
) {

  if (!value) return "—";

  try {

    return new Date(value).toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    );

  } catch {

    return value;
  }
}


function scoreNumber(
  value: unknown,
  fallback = 0,
) {

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      100,
      number,
    ),
  );
}


function safeArray<T = string>(
  value: unknown,
): T[] {

  return Array.isArray(value)
    ? value as T[]
    : [];
}


function parseJsonValue(
  value: unknown,
): any {

  if (
    typeof value !== "string"
  ) {

    return value;
  }

  try {

    return JSON.parse(value);

  } catch {

    return value;
  }
}


function priorityClass(
  priority?: string,
) {

  const value = (
    priority || ""
  ).toLowerCase();

  if (
    value.includes("immediate") ||
    value.includes("critical")
  ) {

    return "critical";
  }

  if (value.includes("high")) {
    return "high";
  }

  if (value.includes("low")) {
    return "low";
  }

  return "review";
}


function statusClass(
  status?: string,
) {

  const value = (
    status || ""
  ).toLowerCase();

  if (
    value.includes("approved") ||
    value.includes("executed") ||
    value.includes("resolved")
  ) {

    return "success";
  }

  if (
    value.includes("rejected") ||
    value.includes("failed")
  ) {

    return "danger";
  }

  return "warning";
}


function riskLabel(
  score: number,
) {

  if (score >= 75) return "Critical";

  if (score >= 50) return "High";

  if (score >= 25) return "Moderate";

  return "Low";
}


function formatAction(
  value?: string | null,
) {

  if (!value) return "—";

  return value.length > 140
    ? `${value.slice(0, 140)}…`
    : value;
}


/* ============================================================
   APP
   ============================================================ */

export default function App() {

  const [
    view,
    setView,
  ] = useState<View>(
    "command",
  );

  const [
    dashboard,
    setDashboard,
  ] = useState<Dashboard | null>(
    null,
  );

  const [
    cases,
    setCases,
  ] = useState<CaseItem[]>(
    [],
  );

  const [
    documents,
    setDocuments,
  ] = useState<DocumentItem[]>(
    [],
  );

  const [
    patterns,
    setPatterns,
  ] = useState<Pattern[]>(
    [],
  );

  const [
    decisions,
    setDecisions,
  ] = useState<Decision[]>(
    [],
  );

  const [
    auditLogs,
    setAuditLogs,
  ] = useState<AuditLog[]>(
    [],
  );

  const [
    outcomes,
    setOutcomes,
  ] = useState<Outcome[]>(
    [],
  );

  const [
    conflicts,
    setConflicts,
  ] = useState<Conflict[]>(
    [],
  );

  const [
    knowledgeHealth,
    setKnowledgeHealth,
  ] = useState<KnowledgeHealth | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    scanning,
    setScanning,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    selectedCase,
    setSelectedCase,
  ] = useState<CaseDetail | null>(
    null,
  );

  const [
    selectedDecision,
    setSelectedDecision,
  ] = useState<Decision | null>(
    null,
  );

  const [
    showCaseModal,
    setShowCaseModal,
  ] = useState(false);

  const [
    showUploadModal,
    setShowUploadModal,
  ] = useState(false);

  const [
    mobileMenu,
    setMobileMenu,
  ] = useState(false);

  const [
    caseTitle,
    setCaseTitle,
  ] = useState("");

  const [
    caseDescription,
    setCaseDescription,
  ] = useState("");

  const [
    caseCategory,
    setCaseCategory,
  ] = useState("Operational");

  const [
    selectedFile,
    setSelectedFile,
  ] = useState<File | null>(
    null,
  );

  const [
    simulationTitle,
    setSimulationTitle,
  ] = useState(
    "Order processing improvement",
  );

  const [
    simulationScenario,
    setSimulationScenario,
  ] = useState(
    "Introduce automated approval for standard orders below ₹50,000 while keeping high-value and high-risk orders under human approval.",
  );

  const [
    simulation,
    setSimulation,
  ] = useState<SimulationResult | null>(
    null,
  );

  const [
    simulationLoading,
    setSimulationLoading,
  ] = useState(false);

  const [
    manager,
    setManager,
  ] = useState("");

  const [
    pin,
    setPin,
  ] = useState("");

  const [
    outcomeMetric,
    setOutcomeMetric,
  ] = useState("Processing time");

  const [
    outcomeBefore,
    setOutcomeBefore,
  ] = useState("");

  const [
    outcomeAfter,
    setOutcomeAfter,
  ] = useState("");

  const [
    outcomeUnit,
    setOutcomeUnit,
  ] = useState("hours");

  const [
    caseSearch,
    setCaseSearch,
  ] = useState("");


  /* ==========================================================
     LOAD
     ========================================================== */

  async function loadAll() {

    try {

      setLoading(true);
      setError("");

      const [
        dashboardData,
        casesData,
        documentsData,
        patternsData,
        decisionsData,
        auditData,
        outcomesData,
        conflictsData,
        healthData,
      ] = await Promise.all([
        api<Dashboard>(
          "/dashboard",
        ),

        api<CaseItem[]>(
          "/cases",
        ),

        api<DocumentItem[]>(
          "/documents",
        ),

        api<Pattern[]>(
          "/patterns",
        ),

        api<Decision[]>(
          "/decisions",
        ),

        api<AuditLog[]>(
          "/audit",
        ),

        api<Outcome[]>(
          "/outcomes",
        ),

        api<Conflict[]>(
          "/conflicts",
        ),

        api<KnowledgeHealth>(
          "/knowledge-health",
        ),
      ]);

      setDashboard(
        dashboardData,
      );

      setCases(
        Array.isArray(casesData)
          ? casesData
          : [],
      );

      setDocuments(
        Array.isArray(documentsData)
          ? documentsData
          : [],
      );

      setPatterns(
        Array.isArray(patternsData)
          ? patternsData
          : [],
      );

      setDecisions(
        Array.isArray(decisionsData)
          ? decisionsData
          : [],
      );

      setAuditLogs(
        Array.isArray(auditData)
          ? auditData
          : [],
      );

      setOutcomes(
        Array.isArray(outcomesData)
          ? outcomesData
          : [],
      );

      setConflicts(
        Array.isArray(conflictsData)
          ? conflictsData
          : [],
      );

      setKnowledgeHealth(
        healthData,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to connect to RIPPLE backend.",
      );

    } finally {

      setLoading(false);
    }
  }


  useEffect(() => {

    loadAll();

  }, []);


  /* ==========================================================
     CASE
     ========================================================== */

  async function createCase() {

    if (
      !caseTitle.trim() ||
      !caseDescription.trim()
    ) {

      setError(
        "Case title and description are required.",
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api(
        "/cases",
        {
          method: "POST",
          body: JSON.stringify({
            title:
              caseTitle.trim(),

            description:
              caseDescription.trim(),

            category:
              caseCategory,
          }),
        },
      );

      setCaseTitle("");
      setCaseDescription("");
      setCaseCategory("Operational");

      setShowCaseModal(false);

      await loadAll();

      setSuccess(
        "RIPPLE investigation created successfully.",
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to create investigation.",
      );

    } finally {

      setLoading(false);
    }
  }


  async function openCase(
    caseId: number,
  ) {

    try {

      setError("");

      const data = await api<CaseDetail>(
        `/cases/${caseId}`,
      );

      setSelectedCase(
        data,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to load case.",
      );
    }
  }


  /* ==========================================================
     PATTERNS
     ========================================================== */

  async function detectPatterns() {

    try {

      setScanning(true);
      setError("");
      setSuccess("");

      const result = await api(
        "/patterns/detect",
        {
          method: "POST",
        },
      );

      await loadAll();

      setSuccess(
        `${result?.count ?? 0} operational pattern(s) analyzed.`,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Pattern detection failed.",
      );

    } finally {

      setScanning(false);
    }
  }


  /* ==========================================================
     SIMULATION
     ========================================================== */

  async function runSimulation() {

    if (
      !simulationTitle.trim() ||
      !simulationScenario.trim()
    ) {

      setError(
        "Simulation title and scenario are required.",
      );

      return;
    }

    try {

      setSimulationLoading(true);
      setError("");
      setSuccess("");

      const result =
        await api<SimulationResult>(
          "/simulate",
          {
            method: "POST",
            body: JSON.stringify({
              title:
                simulationTitle.trim(),

              scenario:
                simulationScenario.trim(),
            }),
          },
        );

      const normalized: SimulationResult = {

        simulation_ids:
          safeArray<number>(
            result?.simulation_ids,
          ),

        options:
          safeArray<SimulationOption>(
            result?.options,
          ).map(
            (
              option,
            ) => ({
              name:
                String(
                  option?.name ||
                  "Unnamed option",
                ),

              risk:
                scoreNumber(
                  option?.risk,
                ),

              impact:
                scoreNumber(
                  option?.impact,
                ),

              confidence:
                scoreNumber(
                  option?.confidence,
                ),

              affected_areas:
                safeArray<string>(
                  option?.affected_areas,
                ),

              consequences:
                safeArray<string>(
                  option?.consequences,
                ),

              required_actions:
                safeArray<string>(
                  option?.required_actions,
                ),

              reason:
                option?.reason ||
                "",
            }),
          ),

        recommended_option:
          String(
            result?.recommended_option ||
            "",
          ),

        recommendation_reason:
          String(
            result?.recommendation_reason ||
            "",
          ),

        overall_risk:
          scoreNumber(
            result?.overall_risk,
          ),
      };

      setSimulation(
        normalized,
      );

      setSuccess(
        "RIPPLE simulation completed.",
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Simulation failed.",
      );

    } finally {

      setSimulationLoading(false);
    }
  }


  /* ==========================================================
     DECISION
     ========================================================== */

  async function sendToDecision(
    option?: SimulationOption,
  ) {

    const selectedOption =
      option ||
      simulation?.options?.find(
        (
          item,
        ) =>
          item.name ===
          simulation.recommended_option,
      );

    if (!selectedOption) {

      setError(
        "Select a simulation option first.",
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      const result =
        await api(
          "/decisions",
          {
            method: "POST",
            body: JSON.stringify({
              title:
                simulationTitle,

              action:
                selectedOption.name,

              recommendation:
                (
                  simulation?.recommendation_reason ||
                  selectedOption.reason ||
                  ""
                ),

              risk:
                scoreNumber(
                  selectedOption.risk,
                ),
            }),
          },
        );

      await loadAll();

      setView(
        "decision",
      );

      setSuccess(
        `Decision #${result?.decision_id ?? ""} sent to the Decision Room.`,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to create decision.",
      );

    } finally {

      setLoading(false);
    }
  }


  async function approveDecision() {

    if (!selectedDecision) {
      return;
    }

    if (
      !manager.trim() ||
      pin.length !== 4
    ) {

      setError(
        "Manager name and 4-digit approval PIN are required.",
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      const result =
        await api(
          "/decisions/approve",
          {
            method: "POST",
            body: JSON.stringify({
              decision_id:
                selectedDecision.id,

              manager:
                manager.trim(),

              pin,
            }),
          },
        );

      setPin("");

      await loadAll();

      const updated =
        await api<Decision[]>(
          "/decisions",
        );

      const fresh =
        updated.find(
          (
            decision,
          ) =>
            decision.id ===
            selectedDecision.id,
        );

      if (fresh) {
        setSelectedDecision(
          fresh,
        );
      }

      setSuccess(
        result?.message ||
        "Decision approved, executed, versioned and audited.",
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to approve decision.",
      );

    } finally {

      setLoading(false);
    }
  }


  async function rejectDecision(
    decisionId: number,
  ) {

    if (
      !manager.trim() ||
      pin.length !== 4
    ) {

      setError(
        "Manager name and 4-digit approval PIN are required.",
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      await api(
        `/decisions/${decisionId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({
            manager:
              manager.trim(),

            pin,
          }),
        },
      );

      setPin("");

      await loadAll();

      setSelectedDecision(
        null,
      );

      setSuccess(
        "Decision rejected by authorized manager.",
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to reject decision.",
      );

    } finally {

      setLoading(false);
    }
  }


  /* ==========================================================
     OUTCOME
     ========================================================== */

  async function recordOutcome() {

    if (!selectedDecision) {
      return;
    }

    if (
      outcomeBefore === "" ||
      outcomeAfter === "" ||
      !outcomeMetric.trim()
    ) {

      setError(
        "Metric, before value and after value are required.",
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      const result =
        await api(
          "/outcomes",
          {
            method: "POST",
            body: JSON.stringify({
              decision_id:
                selectedDecision.id,

              metric:
                outcomeMetric.trim(),

              before_value:
                Number(
                  outcomeBefore,
                ),

              after_value:
                Number(
                  outcomeAfter,
                ),

              unit:
                outcomeUnit.trim(),

              result:
                "",
            }),
          },
        );

      setOutcomeBefore("");
      setOutcomeAfter("");

      await loadAll();

      setSuccess(
        `Outcome recorded: ${result?.result || "Measured"}.`,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Unable to record outcome.",
      );

    } finally {

      setLoading(false);
    }
  }


  /* ==========================================================
     UPLOAD
     ========================================================== */

  async function uploadDocument() {

    if (!selectedFile) {

      setError(
        "Choose a document first.",
      );

      return;
    }

    try {

      setLoading(true);
      setError("");
      setSuccess("");

      const form =
        new FormData();

      form.append(
        "file",
        selectedFile,
      );

      const result =
        await api(
          "/upload",
          {
            method: "POST",
            body: form,
          },
        );

      setSelectedFile(null);
      setShowUploadModal(false);

      await loadAll();

      setSuccess(
        `${result?.name || "Document"} added to RIPPLE knowledge.`,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Document upload failed.",
      );

    } finally {

      setLoading(false);
    }
  }


  /* ==========================================================
     CONFLICTS
     ========================================================== */

  async function detectConflicts() {

    try {

      setScanning(true);
      setError("");
      setSuccess("");

      const result =
        await api(
          "/conflicts/detect",
          {
            method: "POST",
          },
        );

      await loadAll();

      setSuccess(
        `${result?.count ?? 0} new potential conflict(s) detected.`,
      );

    } catch (err: any) {

      setError(
        err?.message ||
        "Conflict detection failed.",
      );

    } finally {

      setScanning(false);
    }
  }


  /* ==========================================================
     DERIVED DATA
     ========================================================== */

  const filteredCases =
    useMemo(
      () => {

        const query =
          caseSearch
            .trim()
            .toLowerCase();

        if (!query) {
          return cases;
        }

        return cases.filter(
          (
            item,
          ) =>
            item.title
              .toLowerCase()
              .includes(query) ||
            item.description
              .toLowerCase()
              .includes(query) ||
            item.category
              .toLowerCase()
              .includes(query) ||
            item.priority
              .toLowerCase()
              .includes(query),
        );
      },
      [
        cases,
        caseSearch,
      ],
    );


  const urgentCases =
    useMemo(
      () =>
        cases.filter(
          (
            item,
          ) =>
            [
              "Immediate",
              "Critical",
              "High",
            ].includes(
              item.priority,
            ),
        ),
      [cases],
    );


  const pendingDecisions =
    useMemo(
      () =>
        decisions.filter(
          (
            item,
          ) =>
            item.status ===
            "pending",
        ),
      [decisions],
    );


  /* ==========================================================
     NAVIGATION
     ========================================================== */

  function navigate(
    nextView: View,
  ) {

    setView(
      nextView,
    );

    setMobileMenu(
      false,
    );

    setError("");
    setSuccess("");
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="app-shell">

      <Sidebar
        view={view}
        navigate={navigate}
        mobileOpen={mobileMenu}
        closeMobile={() =>
          setMobileMenu(false)
        }
      />

      <main className="main-shell">

        <Topbar
          view={view}
          onMenu={() =>
            setMobileMenu(true)
          }
          onRefresh={loadAll}
          loading={loading}
          onUpload={() =>
            setShowUploadModal(true)
          }
        />

        <div className="content-shell">

          {error && (
            <Banner
              type="error"
              message={error}
              onClose={() =>
                setError("")
              }
            />
          )}

          {success && (
            <Banner
              type="success"
              message={success}
              onClose={() =>
                setSuccess("")
              }
            />
          )}

          {view === "command" && (
            <CommandCenter
              dashboard={dashboard}
              patterns={patterns}
              documents={documents}
              urgentCases={urgentCases}
              pendingDecisions={
                pendingDecisions
              }
              conflicts={conflicts}
              knowledgeHealth={
                knowledgeHealth
              }
              auditLogs={auditLogs}
              outcomes={outcomes}
              onCreateCase={() =>
                setShowCaseModal(true)
              }
              onPatterns={
                detectPatterns
              }
              onConflicts={
                detectConflicts
              }
              onCases={() =>
                navigate("cases")
              }
              onImpact={() =>
                navigate("impact")
              }
              onDecision={() =>
                navigate("decision")
              }
              scanning={scanning}
            />
          )}

          {view === "cases" && (
            <CasesView
              cases={filteredCases}
              search={caseSearch}
              setSearch={setCaseSearch}
              onCreate={() =>
                setShowCaseModal(true)
              }
              onOpen={openCase}
              onRefresh={loadAll}
            />
          )}

          {view === "impact" && (
            <ImpactLab
              simulation={
                simulation
              }
              title={
                simulationTitle
              }
              setTitle={
                setSimulationTitle
              }
              scenario={
                simulationScenario
              }
              setScenario={
                setSimulationScenario
              }
              onSimulate={
                runSimulation
              }
              onSendDecision={
                sendToDecision
              }
              loading={
                simulationLoading
              }
              documents={
                documents
              }
            />
          )}

          {view === "decision" && (
            <DecisionRoom
              decisions={
                decisions
              }
              selectedDecision={
                selectedDecision
              }
              setSelectedDecision={
                setSelectedDecision
              }
              manager={
                manager
              }
              setManager={
                setManager
              }
              pin={
                pin
              }
              setPin={
                setPin
              }
              onApprove={
                approveDecision
              }
              onReject={
                rejectDecision
              }
              onOutcome={
                recordOutcome
              }
              outcomeMetric={
                outcomeMetric
              }
              setOutcomeMetric={
                setOutcomeMetric
              }
              outcomeBefore={
                outcomeBefore
              }
              setOutcomeBefore={
                setOutcomeBefore
              }
              outcomeAfter={
                outcomeAfter
              }
              setOutcomeAfter={
                setOutcomeAfter
              }
              outcomeUnit={
                outcomeUnit
              }
              setOutcomeUnit={
                setOutcomeUnit
              }
              outcomes={
                outcomes
              }
              loading={
                loading
              }
            />
          )}

        </div>

      </main>

      {showCaseModal && (
        <Modal
          title="Create Investigation"
          onClose={() =>
            setShowCaseModal(false)
          }
        >
          <div className="form-stack">

            <Field
              label="Problem title"
            >
              <input
                value={
                  caseTitle
                }
                onChange={(event) =>
                  setCaseTitle(
                    event.target.value,
                  )
                }
                placeholder="Example: Order processing delays increased"
              />
            </Field>

            <Field
              label="Category"
            >
              <select
                value={
                  caseCategory
                }
                onChange={(event) =>
                  setCaseCategory(
                    event.target.value,
                  )
                }
              >
                <option>
                  Operational
                </option>
                <option>
                  Customer Support
                </option>
                <option>
                  Compliance
                </option>
                <option>
                  Technology
                </option>
                <option>
                  Finance
                </option>
                <option>
                  Other
                </option>
              </select>
            </Field>

            <Field
              label="Description"
            >
              <textarea
                value={
                  caseDescription
                }
                onChange={(event) =>
                  setCaseDescription(
                    event.target.value,
                  )
                }
                rows={7}
                placeholder="Describe what happened, who is affected, and what evidence is available."
              />
            </Field>

            <div className="modal-actions">

              <button
                className="btn secondary"
                onClick={() =>
                  setShowCaseModal(false)
                }
              >
                Cancel
              </button>

              <button
                className="btn primary"
                onClick={createCase}
                disabled={loading}
              >
                <Brain size={17} />
                Investigate with AI
              </button>

            </div>

          </div>
        </Modal>
      )}

      {showUploadModal && (
        <Modal
          title="Add Knowledge"
          onClose={() =>
            setShowUploadModal(false)
          }
        >
          <div className="form-stack">

            <div className="upload-dropzone">

              <Upload size={30} />

              <strong>
                Upload organizational knowledge
              </strong>

              <span>
                PDF, DOCX, TXT or Markdown
              </span>

              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(event) =>
                  setSelectedFile(
                    event.target.files?.[0] ||
                    null,
                  )
                }
              />

              {selectedFile && (
                <div className="selected-file">
                  <FileText size={17} />
                  {selectedFile.name}
                </div>
              )}

            </div>

            <div className="modal-actions">

              <button
                className="btn secondary"
                onClick={() =>
                  setShowUploadModal(false)
                }
              >
                Cancel
              </button>

              <button
                className="btn primary"
                onClick={
                  uploadDocument
                }
                disabled={
                  loading ||
                  !selectedFile
                }
              >
                <Upload size={17} />
                Add to Knowledge
              </button>

            </div>

          </div>
        </Modal>
      )}

      {selectedCase && (
        <CaseDrawer
          item={
            selectedCase
          }
          onClose={() =>
            setSelectedCase(null)
          }
        />
      )}

    </div>
  );
}


/* ============================================================
   SIDEBAR
   ============================================================ */

function Sidebar({
  view,
  navigate,
  mobileOpen,
  closeMobile,
}: {
  view: View;
  navigate: (
    view: View,
  ) => void;
  mobileOpen: boolean;
  closeMobile: () => void;
}) {

  const items = [
    {
      id:
        "command" as View,

      label:
        "Command Center",

      icon:
        Home,

      description:
        "System overview",
    },

    {
      id:
        "cases" as View,

      label:
        "Cases",

      icon:
        CircleAlert,

      description:
        "Investigate problems",
    },

    {
      id:
        "impact" as View,

      label:
        "Impact Lab",

      icon:
        Network,

      description:
        "Simulate change",
    },

    {
      id:
        "decision" as View,

      label:
        "Decision Room",

      icon:
        ShieldCheck,

      description:
        "Authorize action",
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          className="mobile-overlay"
          onClick={
            closeMobile
          }
        />
      )}

      <aside
        className={`sidebar ${
          mobileOpen
            ? "mobile-open"
            : ""
        }`}
      >

        <div className="brand">

          <div className="brand-mark">
            <WavesIcon />
          </div>

          <div>
            <div className="brand-name">
              RIPPLE
            </div>

            <div className="brand-subtitle">
              AI DECISION INTELLIGENCE
            </div>
          </div>

          <button
            className="sidebar-close"
            onClick={
              closeMobile
            }
          >
            <X size={18} />
          </button>

        </div>

        <div className="sidebar-status">

          <span className="status-dot" />

          <span>
            System Online
          </span>

        </div>

        <nav className="sidebar-nav">

          <div className="nav-label">
            WORKSPACE
          </div>

          {items.map(
            ({
              id,
              label,
              icon: Icon,
              description,
            }) => (

              <button
                key={id}
                className={`nav-item ${
                  view === id
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  navigate(id)
                }
              >

                <span className="nav-icon">
                  <Icon size={19} />
                </span>

                <span className="nav-copy">

                  <strong>
                    {label}
                  </strong>

                  <small>
                    {description}
                  </small>

                </span>

                {view === id && (
                  <ChevronRight
                    size={16}
                  />
                )}

              </button>
            ),
          )}

        </nav>

        <div className="sidebar-bottom">

          <div className="security-card">

            <div className="security-icon">
              <Lock size={17} />
            </div>

            <div>

              <strong>
                Human-in-the-loop
              </strong>

              <span>
                Critical actions require approval
              </span>

            </div>

          </div>

          <div className="sidebar-user">

            <div className="avatar">
              R
            </div>

            <div>
              <strong>
                RIPPLE Operator
              </strong>

              <span>
                Investigation workspace
              </span>
            </div>

          </div>

        </div>

      </aside>
    </>
  );
}


/* ============================================================
   TOPBAR
   ============================================================ */

function Topbar({
  view,
  onMenu,
  onRefresh,
  loading,
  onUpload,
}: {
  view: View;
  onMenu: () => void;
  onRefresh: () => void;
  loading: boolean;
  onUpload: () => void;
}) {

  const titles: Record<
    View,
    string
  > = {
    command:
      "Command Center",

    cases:
      "Investigation Cases",

    impact:
      "Impact Lab",

    decision:
      "Decision Room",
  };

  const descriptions: Record<
    View,
    string
  > = {
    command:
      "Understand what is changing across your organization.",

    cases:
      "Investigate operational problems with AI-assisted evidence.",

    impact:
      "Model consequences before making a change.",

    decision:
      "Move recommendations through controlled human approval.",
  };

  return (
    <header className="topbar">

      <div className="topbar-left">

        <button
          className="mobile-menu-button"
          onClick={onMenu}
        >
          <Menu size={21} />
        </button>

        <div>

          <div className="breadcrumb">
            RIPPLE
            <ChevronRight
              size={13}
            />
            {titles[view]}
          </div>

          <div className="topbar-title">
            {titles[view]}
          </div>

          <div className="topbar-description">
            {descriptions[view]}
          </div>

        </div>

      </div>

      <div className="topbar-actions">

        <button
          className="icon-button"
          title="Refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            size={18}
            className={
              loading
                ? "spin"
                : ""
            }
          />
        </button>

        <button
          className="icon-button"
          title="Notifications"
        >
          <Bell size={18} />
        </button>

        <button
          className="btn secondary top-upload"
          onClick={onUpload}
        >
          <Upload size={16} />
          Knowledge
        </button>

        <div className="topbar-avatar">
          R
        </div>

      </div>

    </header>
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
  pendingDecisions,
  conflicts,
  knowledgeHealth,
  auditLogs,
  outcomes,
  onCreateCase,
  onPatterns,
  onConflicts,
  onCases,
  onImpact,
  onDecision,
  scanning,
}: {
  dashboard: Dashboard | null;
  patterns: Pattern[];
  documents: DocumentItem[];
  urgentCases: CaseItem[];
  pendingDecisions: Decision[];
  conflicts: Conflict[];
  knowledgeHealth: KnowledgeHealth | null;
  auditLogs: AuditLog[];
  outcomes: Outcome[];
  onCreateCase: () => void;
  onPatterns: () => void;
  onConflicts: () => void;
  onCases: () => void;
  onImpact: () => void;
  onDecision: () => void;
  scanning: boolean;
}) {

  const score =
    dashboard?.system_score ??
    0;

  return (
    <div className="page">

      <section className="hero">

        <div className="hero-copy">

          <div className="eyebrow">
            <span className="pulse-dot" />
            SYSTEM PULSE
          </div>

          <h1>
            One problem.
            <br />
            Every connection.
            <br />
            <span>
              One informed decision.
            </span>
          </h1>

          <p>
            RIPPLE investigates operational
            problems, connects evidence,
            simulates consequences and
            keeps humans in control of
            consequential decisions.
          </p>

          <div className="hero-actions">

            <button
              className="btn primary large"
              onClick={onCreateCase}
            >
              <Plus size={18} />
              Start Investigation
            </button>

            <button
              className="btn secondary large"
              onClick={onImpact}
            >
              <Network size={18} />
              Open Impact Lab
            </button>

          </div>

        </div>

        <div className="hero-score">

          <div className="score-orbit">

            <div className="score-ring">

              <div className="score-inner">

                <span>
                  {Math.round(score)}
                </span>

                <small>
                  SYSTEM
                  <br />
                  PULSE
                </small>

              </div>

            </div>

          </div>

          <div className="score-caption">
            Operational intelligence health
          </div>

        </div>

      </section>


      <section className="metrics-grid">

        <MetricCard
          icon={
            <CircleAlert size={19} />
          }
          label="Urgent cases"
          value={
            dashboard?.open_cases ??
            0
          }
          meta="Needs investigation"
          tone="danger"
        />

        <MetricCard
          icon={
            <GitBranch size={19} />
          }
          label="Emerging patterns"
          value={
            dashboard?.patterns ??
            0
          }
          meta="Signals detected"
          tone="purple"
        />

        <MetricCard
          icon={
            <AlertTriangle size={19} />
          }
          label="Knowledge risks"
          value={
            dashboard?.conflicts ??
            0
          }
          meta="Potential conflicts"
          tone="warning"
        />

        <MetricCard
          icon={
            <ShieldCheck size={19} />
          }
          label="Decisions waiting"
          value={
            dashboard?.pending_decisions ??
            0
          }
          meta="Human approval"
          tone="blue"
        />

      </section>


      <section className="section-grid">

        <div className="panel attention-panel">

          <PanelHeader
            icon={
              <AlertTriangle size={18} />
            }
            title="Needs Attention"
            subtitle="Signals RIPPLE believes deserve review"
            action={
              <button
                className="text-button"
                onClick={onCases}
              >
                View cases
                <ArrowRight size={14} />
              </button>
            }
          />

          <div className="attention-list">

            {urgentCases.length === 0 ? (

              <EmptyState
                icon={
                  <CheckCircle2 size={23} />
                }
                title="No urgent cases"
                text="The system has no high-priority investigations right now."
              />

            ) : (

              urgentCases
                .slice(0, 5)
                .map(
                  (
                    item,
                  ) => (

                    <div
                      className="attention-item"
                      key={item.id}
                    >

                      <div
                        className={`severity-marker ${
                          priorityClass(
                            item.priority,
                          )
                        }`}
                      />

                      <div className="attention-main">

                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {formatAction(
                            item.ai_summary ||
                            item.description,
                          )}
                        </span>

                      </div>

                      <Badge
                        label={
                          item.priority
                        }
                        tone={
                          priorityClass(
                            item.priority,
                          )
                        }
                      />

                    </div>
                  ),
                )

            )}

          </div>

        </div>


        <div className="panel pulse-panel">

          <PanelHeader
            icon={
              <Activity size={18} />
            }
            title="Live Ripple Map"
            subtitle="Problem → relationship → decision"
          />

          <RippleMap />

        </div>

      </section>


      <section className="section-grid">

        <div className="panel">

          <PanelHeader
            icon={
              <GitBranch size={18} />
            }
            title="Emerging Patterns"
            subtitle="Recurring signals across cases"
            action={
              <button
                className="btn ghost small"
                onClick={onPatterns}
                disabled={scanning}
              >
                <RefreshCw
                  size={14}
                  className={
                    scanning
                      ? "spin"
                      : ""
                  }
                />
                Detect
              </button>
            }
          />

          {patterns.length === 0 ? (

            <EmptyState
              icon={
                <GitBranch size={23} />
              }
              title="No patterns detected yet"
              text="Create multiple related cases and run pattern detection."
            />

          ) : (

            <div className="pattern-list">

              {patterns
                .slice(0, 4)
                .map(
                  (
                    pattern,
                    index,
                  ) => (

                    <div
                      className="pattern-item"
                      key={
                        pattern.id ??
                        index
                      }
                    >

                      <div className="pattern-index">
                        0{index + 1}
                      </div>

                      <div className="pattern-copy">

                        <strong>
                          {pattern.title}
                        </strong>

                        <span>
                          {pattern.description}
                        </span>

                        <div className="pattern-meta">

                          <Badge
                            label={
                              `${Math.round(
                                pattern.confidence,
                              )}% confidence`
                            }
                            tone="purple"
                          />

                          <span>
                            {pattern.case_count}
                            {" "}
                            cases
                          </span>

                        </div>

                      </div>

                    </div>
                  ),
                )}

            </div>
          )}

        </div>


        <div className="panel">

          <PanelHeader
            icon={
              <Database size={18} />
            }
            title="Knowledge Health"
            subtitle="The evidence base RIPPLE reasons over"
            action={
              <button
                className="btn ghost small"
                onClick={onConflicts}
                disabled={scanning}
              >
                <AlertTriangle size={14} />
                Scan conflicts
              </button>
            }
          />

          <KnowledgeHealthCard
            health={
              knowledgeHealth
            }
            documents={
              documents.length
            }
            conflicts={
              conflicts.length
            }
          />

        </div>

      </section>


      <section className="section-grid">

        <div className="panel">

          <PanelHeader
            icon={
              <ShieldCheck size={18} />
            }
            title="Decision Queue"
            subtitle="Actions waiting for authorized humans"
            action={
              <button
                className="text-button"
                onClick={onDecision}
              >
                Open room
                <ArrowRight size={14} />
              </button>
            }
          />

          {pendingDecisions.length === 0 ? (

            <EmptyState
              icon={
                <ShieldCheck size={23} />
              }
              title="Decision queue is clear"
              text="Simulated recommendations can be sent here for approval."
            />

          ) : (

            <div className="decision-mini-list">

              {pendingDecisions
                .slice(0, 4)
                .map(
                  (
                    decision,
                  ) => (

                    <div
                      className="decision-mini"
                      key={
                        decision.id
                      }
                    >

                      <div className="decision-mini-icon">
                        <Lock size={16} />
                      </div>

                      <div>

                        <strong>
                          {decision.title}
                        </strong>

                        <span>
                          {formatAction(
                            decision.action,
                          )}
                        </span>

                      </div>

                      <Badge
                        label="Pending"
                        tone="warning"
                      />

                    </div>
                  ),
                )}

            </div>
          )}

        </div>


        <div className="panel">

          <PanelHeader
            icon={
              <History size={18} />
            }
            title="Recent Activity"
            subtitle="Traceable actions across RIPPLE"
          />

          {auditLogs.length === 0 ? (

            <EmptyState
              icon={
                <History size={23} />
              }
              title="No activity yet"
              text="Your investigation trail will appear here."
            />

          ) : (

            <div className="activity-list">

              {auditLogs
                .slice(0, 5)
                .map(
                  (
                    log,
                  ) => (

                    <div
                      className="activity-item"
                      key={
                        log.id
                      }
                    >

                      <div className="activity-dot">
                        <Activity size={13} />
                      </div>

                      <div>

                        <strong>
                          {formatAuditAction(
                            log.action,
                          )}
                        </strong>

                        <span>
                          {log.details ||
                            `${log.target_type} #${log.target_id ?? "—"}`}
                        </span>

                      </div>

                      <time>
                        {formatShortDate(
                          log.created_at,
                        )}
                      </time>

                    </div>
                  ),
                )}

            </div>
          )}

        </div>

      </section>


      <section className="closing-banner">

        <div className="closing-icon">
          <Sparkles size={21} />
        </div>

        <div>

          <strong>
            RIPPLE closes the loop.
          </strong>

          <span>
            Investigate → simulate → decide → execute → measure → learn.
          </span>

        </div>

        {outcomes.length > 0 && (
          <Badge
            label={`${outcomes.length} measured outcomes`}
            tone="success"
          />
        )}

      </section>

    </div>
  );
}


/* ============================================================
   CASES
   ============================================================ */

function CasesView({
  cases,
  search,
  setSearch,
  onCreate,
  onOpen,
  onRefresh,
}: {
  cases: CaseItem[];
  search: string;
  setSearch: (
    value: string,
  ) => void;
  onCreate: () => void;
  onOpen: (
    id: number,
  ) => void;
  onRefresh: () => void;
}) {

  return (
    <div className="page">

      <PageHero
        eyebrow="INVESTIGATION"
        title="Cases"
        description="Turn an operational problem into an evidence-backed investigation."
        actions={
          <>
            <button
              className="btn secondary"
              onClick={onRefresh}
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              className="btn primary"
              onClick={onCreate}
            >
              <Plus size={17} />
              New Investigation
            </button>
          </>
        }
      />

      <div className="toolbar">

        <div className="search-box">

          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search cases, categories or priorities..."
          />

        </div>

        <div className="toolbar-count">
          {cases.length} case
          {cases.length === 1
            ? ""
            : "s"}
        </div>

      </div>

      {cases.length === 0 ? (

        <div className="panel empty-large">

          <div className="empty-large-icon">
            <Brain size={29} />
          </div>

          <h3>
            No investigations yet
          </h3>

          <p>
            Start with a real operational problem and let RIPPLE connect the evidence.
          </p>

          <button
            className="btn primary"
            onClick={onCreate}
          >
            <Plus size={17} />
            Start Investigation
          </button>

        </div>

      ) : (

        <div className="cases-grid">

          {cases.map(
            (
              item,
            ) => (

              <button
                className="case-card"
                key={item.id}
                onClick={() =>
                  onOpen(item.id)
                }
              >

                <div className="case-card-top">

                  <Badge
                    label={
                      item.priority
                    }
                    tone={
                      priorityClass(
                        item.priority,
                      )
                    }
                  />

                  <span className="case-number">
                    #{String(
                      item.id,
                    ).padStart(
                      4,
                      "0",
                    )}
                  </span>

                </div>

                <h3>
                  {item.title}
                </h3>

                <p>
                  {item.description}
                </p>

                <div className="case-card-bottom">

                  <span>
                    <Layers3 size={14} />
                    {item.category}
                  </span>

                  <span>
                    <Target size={14} />
                    {Math.round(
                      scoreNumber(
                        item.confidence,
                      ),
                    )}%
                  </span>

                  <ChevronRight
                    size={17}
                  />

                </div>

              </button>
            ),
          )}

        </div>
      )}

    </div>
  );
}


/* ============================================================
   IMPACT LAB
   ============================================================ */

function ImpactLab({
  simulation,
  title,
  setTitle,
  scenario,
  setScenario,
  onSimulate,
  onSendDecision,
  loading,
  documents,
}: {
  simulation: SimulationResult | null;
  title: string;
  setTitle: (
    value: string,
  ) => void;
  scenario: string;
  setScenario: (
    value: string,
  ) => void;
  onSimulate: () => void;
  onSendDecision: (
    option?: SimulationOption,
  ) => void;
  loading: boolean;
  documents: DocumentItem[];
}) {

  return (
    <div className="page">

      <PageHero
        eyebrow="WHAT IF?"
        title="Impact Lab"
        description="Before changing the system, simulate how the change could ripple through people, processes and knowledge."
      />

      <div className="impact-layout">

        <section className="panel scenario-panel">

          <PanelHeader
            icon={
              <Zap size={18} />
            }
            title="Define the change"
            subtitle="Describe the problem and proposed intervention"
          />

          <div className="form-stack">

            <Field
              label="Problem / change title"
            >
              <input
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target.value,
                  )
                }
                placeholder="Example: Order processing improvement"
              />
            </Field>

            <Field
              label="What are you considering?"
            >
              <textarea
                value={scenario}
                onChange={(event) =>
                  setScenario(
                    event.target.value,
                  )
                }
                rows={9}
                placeholder="Describe the proposed change..."
              />
            </Field>

            <div className="knowledge-context">

              <Database size={16} />

              <div>

                <strong>
                  {documents.length}
                  {" "}
                  knowledge source
                  {documents.length === 1
                    ? ""
                    : "s"}
                  {" "}
                  available
                </strong>

                <span>
                  RIPPLE will use the organizational knowledge base as simulation context.
                </span>

              </div>

            </div>

            <button
              className="btn primary large full"
              onClick={onSimulate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw
                    size={18}
                    className="spin"
                  />
                  Simulating...
                </>
              ) : (
                <>
                  <Play size={18} />
                  Run RIPPLE Simulation
                </>
              )}
            </button>

          </div>

        </section>


        <section className="simulation-panel">

          {!simulation ? (

            <div className="simulation-empty">

              <div className="simulation-visual">

                <div className="sim-node center">
                  <WavesIcon />
                </div>

                <div className="sim-node node-one">
                  <FileText size={17} />
                </div>

                <div className="sim-node node-two">
                  <Users size={17} />
                </div>

                <div className="sim-node node-three">
                  <GitBranch size={17} />
                </div>

                <div className="sim-node node-four">
                  <ShieldCheck size={17} />
                </div>

                <div className="sim-line line-one" />
                <div className="sim-line line-two" />
                <div className="sim-line line-three" />
                <div className="sim-line line-four" />

              </div>

              <h2>
                Model the ripple
              </h2>

              <p>
                RIPPLE will compare possible paths, estimate risk and impact, identify affected areas, and recommend an option.
              </p>

            </div>

          ) : (

            <div className="simulation-result">

              <div className="simulation-result-head">

                <div>

                  <div className="eyebrow">
                    <span className="pulse-dot" />
                    RIPPLE SIMULATION
                  </div>

                  <h2>
                    Possible futures
                  </h2>

                </div>

                <div className="overall-risk">

                  <span>
                    Overall risk
                  </span>

                  <strong>
                    {Math.round(
                      simulation.overall_risk,
                    )}
                  </strong>

                  <Badge
                    label={
                      riskLabel(
                        simulation.overall_risk,
                      )
                    }
                    tone={
                      simulation.overall_risk >=
                      75
                        ? "danger"
                        : simulation.overall_risk >=
                            50
                          ? "warning"
                          : "success"
                    }
                  />

                </div>

              </div>

              <div className="options-grid">

                {simulation.options.map(
                  (
                    option,
                    index,
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
                        key={`${option.name}-${index}`}
                      >

                        {recommended && (
                          <div className="recommended-label">
                            <Sparkles size={13} />
                            RIPPLE RECOMMENDS
                          </div>
                        )}

                        <div className="option-top">

                          <div className="option-letter">
                            {String.fromCharCode(
                              65 + index,
                            )}
                          </div>

                          <div>

                            <strong>
                              {option.name}
                            </strong>

                            <span>
                              {option.reason}
                            </span>

                          </div>

                        </div>

                        <div className="option-scores">

                          <ScoreMini
                            label="Risk"
                            value={
                              option.risk
                            }
                            inverse
                          />

                          <ScoreMini
                            label="Impact"
                            value={
                              option.impact
                            }
                          />

                          <ScoreMini
                            label="Confidence"
                            value={
                              option.confidence
                            }
                          />

                        </div>

                        <div className="option-section">

                          <span className="option-label">
                            Affected areas
                          </span>

                          <div className="tag-list">

                            {safeArray<string>(
                              option.affected_areas,
                            )
                              .slice(0, 5)
                              .map(
                                (
                                  area,
                                  areaIndex,
                                ) => (
                                  <span
                                    className="tag"
                                    key={`${area}-${areaIndex}`}
                                  >
                                    {area}
                                  </span>
                                ),
                              )}

                          </div>

                        </div>

                        <div className="option-section">

                          <span className="option-label">
                            Consequences
                          </span>

                          <ul className="consequence-list">

                            {safeArray<string>(
                              option.consequences,
                            )
                              .slice(0, 4)
                              .map(
                                (
                                  consequence,
                                  consequenceIndex,
                                ) => (
                                  <li
                                    key={
                                      consequenceIndex
                                    }
                                  >
                                    <span />
                                    {consequence}
                                  </li>
                                ),
                              )}

                          </ul>

                        </div>

                        <button
                          className={`btn ${
                            recommended
                              ? "primary"
                              : "secondary"
                          } full`}
                          onClick={() =>
                            onSendDecision(
                              option,
                            )
                          }
                        >
                          <ShieldCheck size={16} />
                          Send to Decision Room
                        </button>

                      </div>
                    );
                  },
                )}

              </div>

              <div className="recommendation-box">

                <div className="recommendation-icon">
                  <Brain size={19} />
                </div>

                <div>

                  <span>
                    AI recommendation
                  </span>

                  <strong>
                    {simulation.recommended_option}
                  </strong>

                  <p>
                    {simulation.recommendation_reason}
                  </p>

                  <small>
                    Recommendation is an estimate based on available evidence. Human approval remains required.
                  </small>

                </div>

              </div>

            </div>
          )}

        </section>

      </div>

    </div>
  );
}


/* ============================================================
   DECISION ROOM
   ============================================================ */

function DecisionRoom({
  decisions,
  selectedDecision,
  setSelectedDecision,
  manager,
  setManager,
  pin,
  setPin,
  onApprove,
  onReject,
  onOutcome,
  outcomeMetric,
  setOutcomeMetric,
  outcomeBefore,
  setOutcomeBefore,
  outcomeAfter,
  setOutcomeAfter,
  outcomeUnit,
  setOutcomeUnit,
  outcomes,
  loading,
}: {
  decisions: Decision[];
  selectedDecision: Decision | null;
  setSelectedDecision: (
    decision: Decision | null,
  ) => void;
  manager: string;
  setManager: (
    value: string,
  ) => void;
  pin: string;
  setPin: (
    value: string,
  ) => void;
  onApprove: () => void;
  onReject: (
    id: number,
  ) => void;
  onOutcome: () => void;
  outcomeMetric: string;
  setOutcomeMetric: (
    value: string,
  ) => void;
  outcomeBefore: string;
  setOutcomeBefore: (
    value: string,
  ) => void;
  outcomeAfter: string;
  setOutcomeAfter: (
    value: string,
  ) => void;
  outcomeUnit: string;
  setOutcomeUnit: (
    value: string,
  ) => void;
  outcomes: Outcome[];
  loading: boolean;
}) {

  return (
    <div className="page">

      <PageHero
        eyebrow="CONTROLLED ACTION"
        title="Decision Room"
        description="AI can investigate and recommend. Authorized humans decide what becomes real."
      />

      <div className="decision-layout">

        <section className="panel decision-list-panel">

          <PanelHeader
            icon={
              <ShieldCheck size={18} />
            }
            title="Decision Queue"
            subtitle={`${decisions.length} decision${
              decisions.length === 1
                ? ""
                : "s"
            }`}
          />

          {decisions.length === 0 ? (

            <EmptyState
              icon={
                <Lock size={23} />
              }
              title="No decisions yet"
              text="Send a simulation option here when you are ready for human review."
            />

          ) : (

            <div className="decision-list">

              {decisions.map(
                (
                  decision,
                ) => (

                  <button
                    className={`decision-row ${
                      selectedDecision?.id ===
                      decision.id
                        ? "active"
                        : ""
                    }`}
                    key={
                      decision.id
                    }
                    onClick={() =>
                      setSelectedDecision(
                        decision,
                      )
                    }
                  >

                    <div className="decision-row-icon">
                      {decision.status ===
                      "approved" ? (
                        <CheckCircle2
                          size={18}
                        />
                      ) : decision.status ===
                        "rejected" ? (
                        <XCircle
                          size={18}
                        />
                      ) : (
                        <Lock
                          size={18}
                        />
                      )}
                    </div>

                    <div className="decision-row-copy">

                      <strong>
                        {decision.title}
                      </strong>

                      <span>
                        {formatAction(
                          decision.action,
                        )}
                      </span>

                      <small>
                        {formatDate(
                          decision.created_at,
                        )}
                      </small>

                    </div>

                    <Badge
                      label={
                        decision.status
                      }
                      tone={
                        statusClass(
                          decision.status,
                        )
                      }
                    />

                  </button>
                ),
              )}

            </div>
          )}

        </section>


        <section className="panel decision-detail-panel">

          {!selectedDecision ? (

            <div className="decision-empty">

              <div className="decision-empty-icon">
                <ShieldCheck size={30} />
              </div>

              <h2>
                Select a decision
              </h2>

              <p>
                Review the proposed action, risk, authorization requirements and execution state.
              </p>

            </div>

          ) : (

            <>

              <div className="decision-detail-header">

                <div>

                  <div className="eyebrow">
                    DECISION #
                    {String(
                      selectedDecision.id,
                    ).padStart(
                      4,
                      "0",
                    )}
                  </div>

                  <h2>
                    {selectedDecision.title}
                  </h2>

                  <p>
                    {selectedDecision.action}
                  </p>

                </div>

                <Badge
                  label={
                    selectedDecision.status
                  }
                  tone={
                    statusClass(
                      selectedDecision.status,
                    )
                  }
                />

              </div>


              <div className="decision-risk-grid">

                <DecisionInfo
                  label="Risk"
                  value={`${Math.round(
                    scoreNumber(
                      selectedDecision.risk,
                    ),
                  )}/100`}
                  icon={
                    <AlertTriangle size={17} />
                  }
                />

                <DecisionInfo
                  label="Execution"
                  value={
                    selectedDecision.execution_status ||
                    "not_executed"
                  }
                  icon={
                    <Zap size={17} />
                  }
                />

                <DecisionInfo
                  label="Approved by"
                  value={
                    selectedDecision.approved_by ||
                    "Pending"
                  }
                  icon={
                    <UserCheck size={17} />
                  }
                />

                <DecisionInfo
                  label="Created"
                  value={
                    formatShortDate(
                      selectedDecision.created_at,
                    )
                  }
                  icon={
                    <Clock3 size={17} />
                  }
                />

              </div>


              <div className="decision-recommendation">

                <div className="decision-section-title">
                  <Brain size={17} />
                  AI recommendation
                </div>

                <p>
                  {selectedDecision.recommendation ||
                    "No recommendation text was supplied."}
                </p>

                <div className="decision-notice">
                  <Info size={16} />
                  AI recommendations support the decision. They do not replace authorized human judgment.
                </div>

              </div>


              {selectedDecision.status ===
                "pending" && (

                <div className="authorization-card">

                  <div className="authorization-head">

                    <div className="authorization-icon">
                      <Lock size={18} />
                    </div>

                    <div>

                      <strong>
                        Manager authorization
                      </strong>

                      <span>
                        Enter the authorized manager identity and approval PIN.
                      </span>

                    </div>

                  </div>

                  <div className="authorization-form">

                    <Field
                      label="Manager"
                    >
                      <input
                        value={
                          manager
                        }
                        onChange={(
                          event,
                        ) =>
                          setManager(
                            event.target.value,
                          )
                        }
                        placeholder="Manager name"
                      />
                    </Field>

                    <Field
                      label="Approval PIN"
                    >
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={
                          pin
                        }
                        onChange={(
                          event,
                        ) =>
                          setPin(
                            event.target.value
                              .replace(
                                /\D/g,
                                "",
                              )
                              .slice(
                                0,
                                4,
                              )
                          )
                        }
                        placeholder="4-digit PIN"
                      />
                    </Field>

                  </div>

                  <div className="demo-security-note">
                    <ShieldCheck size={14} />
                    Demo authorization PIN:
                    <strong>
                      2468
                    </strong>
                  </div>

                  <div className="authorization-actions">

                    <button
                      className="btn danger-outline"
                      onClick={() =>
                        onReject(
                          selectedDecision.id,
                        )
                      }
                      disabled={
                        loading
                      }
                    >
                      <XCircle size={16} />
                      Reject
                    </button>

                    <button
                      className="btn primary"
                      onClick={
                        onApprove
                      }
                      disabled={
                        loading
                      }
                    >
                      {loading ? (
                        <RefreshCw
                          size={16}
                          className="spin"
                        />
                      ) : (
                        <ShieldCheck size={16} />
                      )}

                      Approve & Execute
                    </button>

                  </div>

                </div>
              )}


              {selectedDecision.status ===
                "approved" && (

                <div className="executed-card">

                  <div className="executed-icon">
                    <CheckCircle2 size={21} />
                  </div>

                  <div>

                    <strong>
                      Decision executed
                    </strong>

                    <span>
                      {selectedDecision.execution_result ||
                        "Approved and executed."}
                    </span>

                    {selectedDecision.executed_at && (
                      <small>
                        Executed{" "}
                        {formatDate(
                          selectedDecision.executed_at,
                        )}
                      </small>
                    )}

                  </div>

                </div>
              )}


              {selectedDecision.status ===
                "approved" && (

                <div className="outcome-card">

                  <div className="decision-section-title">
                    <TrendingUp size={17} />
                    Measure the outcome
                  </div>

                  <p className="section-description">
                    Compare a measurable result before and after the approved action.
                  </p>

                  <div className="outcome-form">

                    <Field
                      label="Metric"
                    >
                      <input
                        value={
                          outcomeMetric
                        }
                        onChange={(
                          event,
                        ) =>
                          setOutcomeMetric(
                            event.target.value,
                          )
                        }
                        placeholder="Processing time"
                      />
                    </Field>

                    <Field
                      label="Before"
                    >
                      <input
                        type="number"
                        value={
                          outcomeBefore
                        }
                        onChange={(
                          event,
                        ) =>
                          setOutcomeBefore(
                            event.target.value,
                          )
                        }
                        placeholder="24"
                      />
                    </Field>

                    <Field
                      label="After"
                    >
                      <input
                        type="number"
                        value={
                          outcomeAfter
                        }
                        onChange={(
                          event,
                        ) =>
                          setOutcomeAfter(
                            event.target.value,
                          )
                        }
                        placeholder="16"
                      />
                    </Field>

                    <Field
                      label="Unit"
                    >
                      <input
                        value={
                          outcomeUnit
                        }
                        onChange={(
                          event,
                        ) =>
                          setOutcomeUnit(
                            event.target.value,
                          )
                        }
                        placeholder="hours"
                      />
                    </Field>

                  </div>

                  <button
                    className="btn primary"
                    onClick={
                      onOutcome
                    }
                    disabled={
                      loading
                    }
                  >
                    <TrendingUp size={16} />
                    Record Outcome
                  </button>

                  <div className="outcome-note">
                    For metrics such as time, delay, cost or errors, a lower value is treated as an improvement.
                  </div>

                </div>
              )}


              {outcomes.filter(
                (
                  outcome,
                ) =>
                  outcome.decision_id ===
                  selectedDecision.id,
              ).length > 0 && (

                <div className="recorded-outcomes">

                  <div className="decision-section-title">
                    <BarChart3 size={17} />
                    Recorded outcomes
                  </div>

                  {outcomes
                    .filter(
                      (
                        outcome,
                      ) =>
                        outcome.decision_id ===
                        selectedDecision.id,
                    )
                    .map(
                      (
                        outcome,
                      ) => (

                        <div
                          className="recorded-outcome"
                          key={
                            outcome.id
                          }
                        >

                          <div>

                            <strong>
                              {outcome.metric}
                            </strong>

                            <span>
                              {outcome.before_value}
                              {" → "}
                              {outcome.after_value}
                              {" "}
                              {outcome.unit}
                            </span>

                          </div>

                          <Badge
                            label={
                              outcome.result
                            }
                            tone={
                              outcome.result ===
                              "Improved"
                                ? "success"
                                : outcome.result ===
                                    "Declined"
                                  ? "danger"
                                  : "warning"
                            }
                          />

                        </div>
                      ),
                    )}

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
   CASE DRAWER
   ============================================================ */

function CaseDrawer({
  item,
  onClose,
}: {
  item: CaseDetail;
  onClose: () => void;
}) {

  const roots =
    parseJsonValue(
      item.root_cause,
    );

  const rootList =
    Array.isArray(roots)
      ? roots
      : [];

  return (
    <div className="drawer-overlay">

      <div
        className="drawer"
        onClick={(event) =>
          event.stopPropagation()
        }
      >

        <div className="drawer-header">

          <div>

            <div className="eyebrow">
              CASE #
              {String(
                item.id,
              ).padStart(
                4,
                "0",
              )}
            </div>

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


        <div className="drawer-scroll">

          <div className="drawer-badges">

            <Badge
              label={
                item.priority
              }
              tone={
                priorityClass(
                  item.priority,
                )
              }
            />

            <Badge
              label={
                item.category
              }
              tone="blue"
            />

            <Badge
              label={
                `${Math.round(
                  scoreNumber(
                    item.confidence,
                  ),
                )}% confidence`
              }
              tone="purple"
            />

          </div>


          <DrawerSection
            icon={
              <CircleAlert size={17} />
            }
            title="What happened?"
          >
            <p>
              {item.description}
            </p>
          </DrawerSection>


          <DrawerSection
            icon={
              <Brain size={17} />
            }
            title="AI understanding"
          >
            <p>
              {item.ai_summary ||
                "No AI summary available."}
            </p>
          </DrawerSection>


          <DrawerSection
            icon={
              <GitBranch size={17} />
            }
            title="Possible root causes"
          >

            {rootList.length === 0 ? (

              <div className="muted-box">
                No root-cause hypothesis was generated.
              </div>

            ) : (

              <div className="root-cause-list">

                {rootList.map(
                  (
                    root: any,
                    index,
                  ) => {

                    const hypothesis =
                      typeof root ===
                      "string"
                        ? root
                        : root?.hypothesis ||
                          "Possible cause";

                    const confidence =
                      typeof root ===
                      "object"
                        ? scoreNumber(
                            root?.confidence,
                          )
                        : 0;

                    const evidence =
                      typeof root ===
                      "object"
                        ? root?.evidence
                        : "";

                    return (
                      <div
                        className="root-cause-item"
                        key={
                          index
                        }
                      >

                        <div className="root-cause-number">
                          {index + 1}
                        </div>

                        <div>

                          <strong>
                            {hypothesis}
                          </strong>

                          {evidence && (
                            <span>
                              Evidence:{" "}
                              {evidence}
                            </span>
                          )}

                          {confidence > 0 && (
                            <small>
                              {Math.round(
                                confidence,
                              )}% confidence
                            </small>
                          )}

                        </div>

                      </div>
                    );
                  },
                )}

              </div>
            )}

          </DrawerSection>


          <DrawerSection
            icon={
              <FileText size={17} />
            }
            title="Evidence"
          >

            {safeArray<Evidence>(
              item.evidence,
            ).length === 0 ? (

              <div className="muted-box">
                No document evidence was attached.
              </div>

            ) : (

              <div className="evidence-list">

                {safeArray<Evidence>(
                  item.evidence,
                )
                  .slice(0, 8)
                  .map(
                    (
                      evidence,
                      index,
                    ) => (

                      <div
                        className="evidence-item"
                        key={
                          evidence.id ??
                          index
                        }
                      >

                        <div className="evidence-icon">
                          <FileText size={15} />
                        </div>

                        <div>

                          <strong>
                            {evidence.title ||
                              "Evidence"}
                          </strong>

                          <p>
                            {evidence.content ||
                              "No evidence text."}
                          </p>

                          <small>
                            Relevance{" "}
                            {Math.round(
                              scoreNumber(
                                evidence.relevance,
                              ),
                            )}%
                          </small>

                        </div>

                      </div>
                    ),
                  )}

              </div>
            )}

          </DrawerSection>


          <DrawerSection
            icon={
              <Target size={17} />
            }
            title="Recommended action"
          >

            <div className="recommendation-inline">

              <Sparkles size={17} />

              <span>
                {item.recommendation ||
                  "No recommendation available."}
              </span>

            </div>

          </DrawerSection>


          <div className="drawer-footer-note">

            <ShieldCheck size={16} />

            AI analysis is advisory. Operational decisions remain subject to authorized human review.

          </div>

        </div>

      </div>

    </div>
  );
}


/* ============================================================
   UI COMPONENTS
   ============================================================ */

function PageHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {

  return (
    <section className="page-hero">

      <div>

        <div className="eyebrow">
          {eyebrow}
        </div>

        <h1>
          {title}
        </h1>

        <p>
          {description}
        </p>

      </div>

      {actions && (
        <div className="page-hero-actions">
          {actions}
        </div>
      )}

    </section>
  );
}


function PanelHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {

  return (
    <div className="panel-header">

      <div className="panel-title-group">

        <div className="panel-icon">
          {icon}
        </div>

        <div>

          <h3>
            {title}
          </h3>

          {subtitle && (
            <span>
              {subtitle}
            </span>
          )}

        </div>

      </div>

      {action}

    </div>
  );
}


function MetricCard({
  icon,
  label,
  value,
  meta,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  meta: string;
  tone: string;
}) {

  return (
    <div
      className={`metric-card ${tone}`}
    >

      <div className="metric-top">

        <div className="metric-icon">
          {icon}
        </div>

        <span>
          {label}
        </span>

      </div>

      <strong>
        {value}
      </strong>

      <small>
        {meta}
      </small>

    </div>
  );
}


function Badge({
  label,
  tone = "neutral",
}: {
  label: ReactNode;
  tone?: string;
}) {

  return (
    <span
      className={`badge ${tone}`}
    >
      {label}
    </span>
  );
}


function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
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


function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {

  return (
    <label className="field">

      <span>
        {label}
      </span>

      {children}

    </label>
  );
}


function Banner({
  type,
  message,
  onClose,
}: {
  type: "error" | "success";
  message: string;
  onClose: () => void;
}) {

  return (
    <div
      className={`banner ${type}`}
    >

      {type === "error" ? (
        <AlertCircle size={17} />
      ) : (
        <CheckCircle2 size={17} />
      )}

      <span>
        {message}
      </span>

      <button
        onClick={onClose}
        className="banner-close"
      >
        <X size={15} />
      </button>

    </div>
  );
}


function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >

      <div
        className="modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >

        <div className="modal-header">

          <h2>
            {title}
          </h2>

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


function ScoreMini({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: number;
  inverse?: boolean;
}) {

  const score =
    scoreNumber(
      value,
    );

  return (
    <div className="score-mini">

      <span>
        {label}
      </span>

      <strong>
        {Math.round(score)}
      </strong>

      <div className="score-bar">

        <div
          className={`score-fill ${
            inverse
              ? "inverse"
              : ""
          }`}
          style={{
            width: `${score}%`,
          }}
        />

      </div>

    </div>
  );
}


function KnowledgeHealthCard({
  health,
  documents,
  conflicts,
}: {
  health: KnowledgeHealth | null;
  documents: number;
  conflicts: number;
}) {

  const score =
    scoreNumber(
      health?.score ??
      0,
    );

  return (
    <div className="knowledge-health">

      <div className="knowledge-score">

        <div className="knowledge-score-ring">

          <span>
            {Math.round(score)}
          </span>

        </div>

        <div>

          <strong>
            Knowledge health
          </strong>

          <span>
            {documents} source
            {documents === 1
              ? ""
              : "s"}
            {" · "}
            {conflicts} potential conflict
            {conflicts === 1
              ? ""
              : "s"}
          </span>

        </div>

      </div>

      <div className="knowledge-bars">

        <div>

          <span>
            Evidence coverage
          </span>

          <div className="health-bar">

            <div
              style={{
                width: `${score}%`,
              }}
            />

          </div>

        </div>

        <div className="knowledge-health-note">
          Potential conflicts are surfaced for human review rather than treated as automatic truth.
        </div>

      </div>

    </div>
  );
}


function DecisionInfo({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {

  return (
    <div className="decision-info">

      <div className="decision-info-icon">
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


function DrawerSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {

  return (
    <section className="drawer-section">

      <div className="drawer-section-title">

        {icon}

        <span>
          {title}
        </span>

      </div>

      {children}

    </section>
  );
}


/* ============================================================
   RIPPLE MAP
   ============================================================ */

function RippleMap() {

  const nodes = [
    {
      label: "Problem",
      sub:
        "Signal detected",
      icon:
        <CircleAlert size={17} />,
      className:
        "map-problem",
    },

    {
      label: "People",
      sub:
        "Teams affected",
      icon:
        <Users size={17} />,
      className:
        "map-people",
    },

    {
      label: "Knowledge",
      sub:
        "SOPs + evidence",
      icon:
        <FileText size={17} />,
      className:
        "map-knowledge",
    },

    {
      label: "Action",
      sub:
        "Decision",
      icon:
        <ShieldCheck size={17} />,
      className:
        "map-action",
    },
  ];

  return (
    <div className="ripple-map">

      <div className="map-lines">

        <span className="map-line l1" />
        <span className="map-line l2" />
        <span className="map-line l3" />

      </div>

      {nodes.map(
        (
          node,
        ) => (

          <div
            className={`map-node ${node.className}`}
            key={
              node.label
            }
          >

            <div className="map-node-icon">
              {node.icon}
            </div>

            <div>

              <strong>
                {node.label}
              </strong>

              <span>
                {node.sub}
              </span>

            </div>

          </div>
        ),
      )}

    </div>
  );
}


function WavesIcon() {

  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >

      <circle
        cx="16"
        cy="16"
        r="3"
        fill="currentColor"
      />

      <circle
        cx="16"
        cy="16"
        r="8"
        stroke="currentColor"
        strokeWidth="1.7"
        opacity=".75"
      />

      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity=".4"
      />

    </svg>
  );
}


/* ============================================================
   AUDIT HELPERS
   ============================================================ */

function formatAuditAction(
  action?: string,
) {

  if (!action) {
    return "Activity";
  }

  return action
    .toLowerCase()
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /^\w/,
      (
        char,
      ) =>
        char.toUpperCase(),
    );
}