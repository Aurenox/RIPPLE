import os
import re
import json
import sqlite3
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, List

import fitz
from docx import Document as DocxDocument
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from google import genai
from google.genai import types


# ============================================================
# RIPPLE — AI INVESTIGATION & DECISION INTELLIGENCE
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DB_PATH = BASE_DIR / "ripple.db"

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

gemini_client = None

if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception:
        gemini_client = None


app = FastAPI(
    title="RIPPLE",
    description="AI Investigation & Decision Intelligence Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT,
            file_type TEXT,
            content TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER,
            section_no INTEGER,
            title TEXT,
            content TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            category TEXT,
            priority TEXT,
            confidence REAL,
            status TEXT,
            ai_summary TEXT,
            root_cause TEXT,
            recommendation TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER,
            source_type TEXT,
            source_id INTEGER,
            title TEXT,
            content TEXT,
            relevance REAL,
            FOREIGN KEY(case_id) REFERENCES cases(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            confidence REAL,
            severity TEXT,
            case_count INTEGER,
            status TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS simulations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            scenario TEXT,
            option_name TEXT,
            risk REAL,
            impact REAL,
            confidence REAL,
            affected_areas TEXT,
            consequences TEXT,
            recommendation TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            action TEXT,
            recommendation TEXT,
            risk REAL,
            status TEXT,
            approved_by TEXT,
            created_at TEXT,
            decided_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT,
            role TEXT,
            action TEXT,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            decision_id INTEGER,
            metric TEXT,
            before_value REAL,
            after_value REAL,
            unit TEXT,
            result TEXT,
            recorded_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            old_value TEXT,
            new_value TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS impacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            change_id INTEGER,
            document_id INTEGER,
            section_id INTEGER,
            affected INTEGER,
            confidence REAL,
            reason TEXT,
            suggested_fix TEXT,
            matched_text TEXT,
            status TEXT DEFAULT 'pending'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER,
            version INTEGER,
            change_summary TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS conflicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER,
            section_a INTEGER,
            section_b INTEGER,
            topic TEXT,
            value_a TEXT,
            value_b TEXT,
            severity TEXT,
            explanation TEXT
        )
    """)

    conn.commit()
    conn.close()


init_db()


# ============================================================
# MODELS
# ============================================================

class ChangeRequest(BaseModel):
    title: str
    old_value: str
    new_value: str


class ImpactUpdate(BaseModel):
    status: str


class CaseRequest(BaseModel):
    title: str
    description: str
    category: Optional[str] = "Operational"


class SimulationRequest(BaseModel):
    title: str
    scenario: str


class DecisionRequest(BaseModel):
    title: str
    action: str
    recommendation: str = ""
    risk: float = 0


class ApprovalRequest(BaseModel):
    decision_id: int
    manager: str
    pin: str


class OutcomeRequest(BaseModel):
    decision_id: int
    metric: str
    before_value: float
    after_value: float
    unit: str = ""
    result: str = ""


# ============================================================
# HELPERS
# ============================================================

def now():
    return datetime.utcnow().isoformat()


def clean_text(text: str):
    text = text.replace("\x00", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def split_sections(text: str):
    paragraphs = [
        p.strip()
        for p in re.split(r"\n\s*\n", text)
        if p.strip()
    ]

    if not paragraphs:
        paragraphs = [text]

    return paragraphs


def extract_pdf(path: Path):
    doc = fitz.open(path)
    pages = []

    for page in doc:
        pages.append(page.get_text())

    doc.close()
    return "\n\n".join(pages)


def extract_docx(path: Path):
    doc = DocxDocument(path)

    paragraphs = [
        p.text.strip()
        for p in doc.paragraphs
        if p.text.strip()
    ]

    return "\n\n".join(paragraphs)


def extract_text(path: Path):
    ext = path.suffix.lower()

    if ext == ".pdf":
        return extract_pdf(path)

    if ext == ".docx":
        return extract_docx(path)

    if ext in [".txt", ".md"]:
        return path.read_text(
            encoding="utf-8",
            errors="ignore"
        )

    raise ValueError("Unsupported file type")


def similarity_score(a: str, b: str):
    a_words = set(
        re.findall(
            r"\b[a-zA-Z0-9]+\b",
            a.lower()
        )
    )

    b_words = set(
        re.findall(
            r"\b[a-zA-Z0-9]+\b",
            b.lower()
        )
    )

    if not a_words or not b_words:
        return 0

    return len(a_words & b_words) / max(
        1,
        len(a_words | b_words)
    )


def audit(
    actor,
    role,
    action,
    target_type,
    target_id=None,
    details=""
):
    conn = db()

    conn.execute("""
        INSERT INTO audit_logs
        (actor, role, action, target_type, target_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        actor,
        role,
        action,
        target_type,
        target_id,
        details,
        now()
    ))

    conn.commit()
    conn.close()


def safe_json(text):
    try:
        return json.loads(text)
    except Exception:
        match = re.search(
            r"\{.*\}",
            text,
            re.S
        )

        if match:
            try:
                return json.loads(
                    match.group()
                )
            except Exception:
                pass

    return {}


def sqlite_safe(value, default=""):
    """
    Convert Gemini list/dict values into JSON strings
    so SQLite can store them safely.
    """

    if value is None:
        return default

    if isinstance(value, (list, dict)):
        return json.dumps(
            value,
            ensure_ascii=False
        )

    return str(value)


# ============================================================
# GEMINI
# ============================================================

def ask_ai(prompt: str):

    if not gemini_client:
        return {}

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json"
            )
        )

        return safe_json(response.text)

    except Exception:
        return {}


# ============================================================
# AI INVESTIGATION
# ============================================================

def investigate_case(
    title,
    description,
    documents
):

    context = "\n\n".join(
        f"DOCUMENT: {d['name']}\n"
        f"{d['content'][:5000]}"
        for d in documents
    )

    prompt = f"""
You are RIPPLE, an AI investigation and decision
intelligence engine.

Investigate the following operational problem.

TITLE:
{title}

DESCRIPTION:
{description}

AVAILABLE ORGANIZATIONAL KNOWLEDGE:
{context}

Return JSON with:

summary
priority
confidence
possible_root_causes
evidence
patterns
affected_areas
recommended_action
risk_score
reasoning

Rules:
- Do not claim causality without evidence.
- Root causes are hypotheses.
- Clearly distinguish evidence from inference.
- Give confidence between 0 and 100.
- Risk score between 0 and 100.
- Identify indirect relationships.
"""

    result = ask_ai(prompt)

    if result:
        return result

    priority = "High"

    if any(
        word in description.lower()
        for word in [
            "critical",
            "security",
            "danger",
            "outage"
        ]
    ):
        priority = "Immediate"

    return {
        "summary": description[:300],
        "priority": priority,
        "confidence": 72,
        "possible_root_causes": [
            {
                "hypothesis":
                    "Possible process or knowledge gap",
                "confidence": 60,
                "evidence":
                    "Requires further investigation"
            }
        ],
        "evidence": [],
        "patterns": [],
        "affected_areas": [
            "Operations",
            "Relevant procedures"
        ],
        "recommended_action":
            "Review the affected process and verify "
            "the available evidence.",
        "risk_score": 45,
        "reasoning":
            "Initial analysis generated using "
            "available case information."
    }


# ============================================================
# AI WHAT-IF SIMULATION
# ============================================================

def simulate_scenario(
    title,
    scenario,
    documents
):

    context = "\n\n".join(
        f"{d['name']}: {d['content'][:4000]}"
        for d in documents
    )

    prompt = f"""
You are RIPPLE's Impact Simulation Engine.

Problem:
{title}

Proposed scenario:
{scenario}

Organizational knowledge:
{context}

Simulate three possible options.

Return JSON:

{{
  "options": [
    {{
      "name": "...",
      "risk": 0,
      "impact": 0,
      "confidence": 0,
      "affected_areas": [],
      "consequences": [],
      "required_actions": [],
      "reason": "..."
    }}
  ],
  "recommended_option": "...",
  "recommendation_reason": "...",
  "overall_risk": 0
}}

Risk and impact must be 0-100.

Do not pretend simulation is certainty.
Use estimated outcomes.
"""

    result = ask_ai(prompt)

    if result:
        return result

    return {
        "options": [
            {
                "name":
                    "Option A — Immediate change",
                "risk": 35,
                "impact": 78,
                "confidence": 64,
                "affected_areas": [
                    "Operations"
                ],
                "consequences": [
                    "Fast improvement",
                    "Requires process adjustment"
                ],
                "required_actions": [
                    "Review procedure",
                    "Notify affected staff"
                ],
                "reason":
                    "Fastest intervention."
            },
            {
                "name":
                    "Option B — Controlled rollout",
                "risk": 22,
                "impact": 70,
                "confidence": 72,
                "affected_areas": [
                    "Operations",
                    "Support"
                ],
                "consequences": [
                    "Lower transition risk",
                    "Slower implementation"
                ],
                "required_actions": [
                    "Pilot change",
                    "Measure results"
                ],
                "reason":
                    "Balances impact and risk."
            },
            {
                "name":
                    "Option C — No immediate change",
                "risk": 68,
                "impact": 25,
                "confidence": 61,
                "affected_areas": [],
                "consequences": [
                    "Problem may continue",
                    "Existing process remains"
                ],
                "required_actions": [
                    "Continue monitoring"
                ],
                "reason":
                    "Avoids immediate disruption."
            }
        ],
        "recommended_option":
            "Option B — Controlled rollout",
        "recommendation_reason":
            "It provides a strong expected impact "
            "while reducing transition risk.",
        "overall_risk": 32
    }


# ============================================================
# AI PATTERN DETECTION
# ============================================================

def detect_patterns(cases):

    if not cases:
        return []

    data = "\n".join(
        f"{c['title']} | "
        f"{c['category']} | "
        f"{c['description']}"
        for c in cases
    )

    prompt = f"""
You are RIPPLE's Pattern Detection Engine.

Analyze these operational cases:

{data}

Return JSON:

{{
  "patterns": [
    {{
      "title": "...",
      "description": "...",
      "confidence": 0,
      "severity": "Low|Medium|High|Critical",
      "case_count": 0,
      "possible_common_factor": "...",
      "evidence": []
    }}
  ]
}}

Do not claim causality.
Describe possible correlations or recurring signals.
"""

    result = ask_ai(prompt)

    if result and "patterns" in result:
        return result["patterns"]

    return []


# ============================================================
# HEALTH SCORE
# ============================================================

def calculate_health():

    conn = db()

    documents = conn.execute(
        "SELECT COUNT(*) AS c FROM documents"
    ).fetchone()["c"]

    cases = conn.execute(
        "SELECT COUNT(*) AS c FROM cases"
    ).fetchone()["c"]

    pending = conn.execute("""
        SELECT COUNT(*) AS c
        FROM decisions
        WHERE status='pending'
    """).fetchone()["c"]

    audit_count = conn.execute(
        "SELECT COUNT(*) AS c FROM audit_logs"
    ).fetchone()["c"]

    conflicts = conn.execute(
        "SELECT COUNT(*) AS c FROM conflicts"
    ).fetchone()["c"]

    conn.close()

    score = 100

    score -= min(
        conflicts * 4,
        20
    )

    score -= min(
        pending * 3,
        15
    )

    if documents == 0:
        score -= 10

    return max(
        0,
        min(100, score)
    )


# ============================================================
# BASIC
# ============================================================

@app.get("/")
def root():
    return {
        "name": "RIPPLE",
        "description":
            "AI Investigation & Decision Intelligence",
        "status": "online"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "system_score": calculate_health(),
        "ai": bool(gemini_client)
    }


# ============================================================
# DOCUMENTS
# ============================================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    allowed = [
        ".pdf",
        ".docx",
        ".txt",
        ".md"
    ]

    ext = Path(
        file.filename
    ).suffix.lower()

    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=
                "Supported files: PDF, DOCX, TXT, MD"
        )

    safe_name = re.sub(
        r"[^a-zA-Z0-9._-]",
        "_",
        file.filename
    )

    path = UPLOAD_DIR / safe_name

    with open(path, "wb") as buffer:
        buffer.write(
            await file.read()
        )

    try:
        content = clean_text(
            extract_text(path)
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    conn = db()

    cur = conn.execute("""
        INSERT INTO documents
        (name, path, file_type, content, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (
        file.filename,
        str(path),
        ext,
        content,
        now()
    ))

    document_id = cur.lastrowid

    sections = split_sections(content)

    for index, section in enumerate(
        sections,
        1
    ):

        title = section.split(".")[0][:100]

        conn.execute("""
            INSERT INTO sections
            (document_id, section_no, title, content)
            VALUES (?, ?, ?, ?)
        """, (
            document_id,
            index,
            title,
            section
        ))

    conn.commit()
    conn.close()

    audit(
        "system",
        "system",
        "UPLOAD_DOCUMENT",
        "document",
        document_id,
        file.filename
    )

    return {
        "success": True,
        "document_id": document_id,
        "name": file.filename,
        "sections": len(sections)
    }


@app.get("/documents")
def get_documents():

    conn = db()

    rows = conn.execute("""
        SELECT id, name, file_type, created_at
        FROM documents
        ORDER BY id DESC
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


@app.get("/documents/{document_id}")
def get_document(
    document_id: int
):

    conn = db()

    document = conn.execute("""
        SELECT *
        FROM documents
        WHERE id=?
    """, (
        document_id,
    )).fetchone()

    if not document:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    sections = conn.execute("""
        SELECT *
        FROM sections
        WHERE document_id=?
        ORDER BY section_no
    """, (
        document_id,
    )).fetchall()

    conn.close()

    return {
        "document": dict(document),
        "sections": [
            dict(s)
            for s in sections
        ]
    }


# ============================================================
# IMPACT ANALYSIS
# ============================================================

@app.post("/analyze-change")
def analyze_change(
    request: ChangeRequest
):

    conn = db()

    cur = conn.execute("""
        INSERT INTO changes
        (title, old_value, new_value, created_at)
        VALUES (?, ?, ?, ?)
    """, (
        request.title,
        request.old_value,
        request.new_value,
        now()
    ))

    change_id = cur.lastrowid

    documents = conn.execute("""
        SELECT *
        FROM documents
    """).fetchall()

    results = []

    for document in documents:

        sections = conn.execute("""
            SELECT *
            FROM sections
            WHERE document_id=?
        """, (
            document["id"],
        )).fetchall()

        for section in sections:

            text = section["content"]

            exact = (
                request.old_value.lower()
                in text.lower()
            )

            semantic = (
                similarity_score(
                    request.old_value,
                    text
                ) > 0.05
            )

            if not exact and not semantic:
                continue

            confidence = (
                95
                if exact
                else 62
            )

            reason = (
                f"The section directly contains "
                f"the value '{request.old_value}'."
                if exact
                else
                "The section appears semantically "
                "related to the changed value."
            )

            suggested = text

            if exact:
                suggested = re.sub(
                    re.escape(
                        request.old_value
                    ),
                    request.new_value,
                    text,
                    flags=re.I
                )

            ai = ask_ai(f"""
Analyze this knowledge section for a change.

Old value: {request.old_value}
New value: {request.new_value}

Section:
{text}

Return JSON:
{{
 "affected": true,
 "confidence": 0,
 "reason": "...",
 "suggested_fix": "...",
 "relationship":
     "DIRECT|INDIRECT|SEMANTIC|CONFLICT"
}}
""")

            if ai:
                confidence = ai.get(
                    "confidence",
                    confidence
                )

                reason = ai.get(
                    "reason",
                    reason
                )

                suggested = ai.get(
                    "suggested_fix",
                    suggested
                )

            cur2 = conn.execute("""
                INSERT INTO impacts
                (
                    change_id,
                    document_id,
                    section_id,
                    affected,
                    confidence,
                    reason,
                    suggested_fix,
                    matched_text,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            """, (
                change_id,
                document["id"],
                section["id"],
                1,
                confidence,
                reason,
                suggested,
                request.old_value
            ))

            results.append({
                "id": cur2.lastrowid,
                "document_id":
                    document["id"],
                "document_name":
                    document["name"],
                "section_id":
                    section["id"],
                "section_no":
                    section["section_no"],
                "affected": True,
                "confidence": confidence,
                "reason": reason,
                "suggested_fix": suggested,
                "matched_text":
                    request.old_value,
                "relationship":
                    ai.get(
                        "relationship",
                        "DIRECT"
                    )
                    if ai
                    else (
                        "DIRECT"
                        if exact
                        else "SEMANTIC"
                    )
            })

    conn.commit()
    conn.close()

    audit(
        "system",
        "system",
        "ANALYZE_CHANGE",
        "change",
        change_id,
        request.title
    )

    return {
        "change_id": change_id,
        "title": request.title,
        "old_value":
            request.old_value,
        "new_value":
            request.new_value,
        "impact_count":
            len(results),
        "blast_radius":
            len(results),
        "results": results
    }


@app.get("/impacts/{change_id}")
def get_impacts(
    change_id: int
):

    conn = db()

    rows = conn.execute("""
        SELECT
            impacts.*,
            documents.name AS document_name,
            sections.section_no,
            sections.content AS section_content
        FROM impacts
        JOIN documents
            ON documents.id=impacts.document_id
        JOIN sections
            ON sections.id=impacts.section_id
        WHERE impacts.change_id=?
    """, (
        change_id,
    )).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


@app.patch("/impacts/{impact_id}")
def update_impact(
    impact_id: int,
    request: ImpactUpdate
):

    conn = db()

    impact = conn.execute("""
        SELECT *
        FROM impacts
        WHERE id=?
    """, (
        impact_id,
    )).fetchone()

    if not impact:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Impact not found"
        )

    conn.execute("""
        UPDATE impacts
        SET status=?
        WHERE id=?
    """, (
        request.status,
        impact_id
    ))

    conn.commit()
    conn.close()

    audit(
        "manager",
        "manager",
        "UPDATE_IMPACT",
        "impact",
        impact_id,
        request.status
    )

    return {
        "success": True,
        "status": request.status
    }


# ============================================================
# INVESTIGATION / CASES
# ============================================================

@app.post("/cases")
def create_case(
    request: CaseRequest
):

    conn = db()

    documents = conn.execute("""
        SELECT *
        FROM documents
    """).fetchall()

    docs = [
        dict(d)
        for d in documents
    ]

    analysis = investigate_case(
        request.title,
        request.description,
        docs
    )

    # --------------------------------------------------------
    # SQLITE-SAFE AI VALUES
    # Gemini can return lists/dicts instead of strings.
    # SQLite cannot directly store Python lists/dicts.
    # --------------------------------------------------------

    priority = sqlite_safe(
        analysis.get(
            "priority",
            "Review"
        ),
        "Review"
    )

    confidence = analysis.get(
        "confidence",
        70
    )

    if isinstance(
        confidence,
        (list, dict)
    ):
        confidence = 70

    try:
        confidence = float(
            confidence
        )
    except (
        TypeError,
        ValueError
    ):
        confidence = 70

    summary = sqlite_safe(
        analysis.get(
            "summary",
            ""
        ),
        ""
    )

    root_causes = sqlite_safe(
        analysis.get(
            "possible_root_causes",
            []
        ),
        "[]"
    )

    recommendation = sqlite_safe(
        analysis.get(
            "recommended_action",
            ""
        ),
        ""
    )

    cur = conn.execute("""
        INSERT INTO cases
        (
            title,
            description,
            category,
            priority,
            confidence,
            status,
            ai_summary,
            root_cause,
            recommendation,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        request.title,
        request.description,
        request.category,
        priority,
        confidence,
        "open",
        summary,
        root_causes,
        recommendation,
        now()
    ))

    case_id = cur.lastrowid

    # --------------------------------------------------------
    # SAVE AI EVIDENCE
    # --------------------------------------------------------

    evidence_items = analysis.get(
        "evidence",
        []
    )

    if not isinstance(
        evidence_items,
        list
    ):
        evidence_items = [
            evidence_items
        ]

    for evidence in evidence_items:

        if not isinstance(
            evidence,
            dict
        ):
            evidence = {
                "content": evidence
            }

        source_type = sqlite_safe(
            evidence.get(
                "source_type",
                "AI"
            ),
            "AI"
        )

        source_id = evidence.get(
            "source_id"
        )

        if isinstance(
            source_id,
            (list, dict)
        ):
            source_id = json.dumps(
                source_id,
                ensure_ascii=False
            )

        evidence_title = sqlite_safe(
            evidence.get(
                "title",
                "AI evidence"
            ),
            "AI evidence"
        )

        evidence_content = sqlite_safe(
            evidence.get(
                "content",
                ""
            ),
            ""
        )

        relevance = evidence.get(
            "relevance",
            60
        )

        if isinstance(
            relevance,
            (list, dict)
        ):
            relevance = 60

        try:
            relevance = float(
                relevance
            )
        except (
            TypeError,
            ValueError
        ):
            relevance = 60

        conn.execute("""
            INSERT INTO evidence
            (
                case_id,
                source_type,
                source_id,
                title,
                content,
                relevance
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            case_id,
            source_type,
            source_id,
            evidence_title,
            evidence_content,
            relevance
        ))

    conn.commit()
    conn.close()

    audit(
        "user",
        "user",
        "CREATE_CASE",
        "case",
        case_id,
        request.title
    )

    return {
        "case_id": case_id,
        "analysis": analysis
    }


@app.get("/cases")
def get_cases():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM cases
        ORDER BY id DESC
    """).fetchall()

    conn.close()

    result = []

    for row in rows:

        item = dict(row)

        try:
            item["root_cause"] = json.loads(
                item["root_cause"] or "[]"
            )
        except Exception:
            item["root_cause"] = []

        result.append(item)

    return result


@app.get("/cases/{case_id}")
def get_case(
    case_id: int
):

    conn = db()

    case = conn.execute("""
        SELECT *
        FROM cases
        WHERE id=?
    """, (
        case_id,
    )).fetchone()

    evidence = conn.execute("""
        SELECT *
        FROM evidence
        WHERE case_id=?
    """, (
        case_id,
    )).fetchall()

    conn.close()

    if not case:
        raise HTTPException(
            status_code=404,
            detail="Case not found"
        )

    item = dict(case)

    try:
        item["root_cause"] = json.loads(
            item["root_cause"] or "[]"
        )
    except Exception:
        item["root_cause"] = []

    item["evidence"] = [
        dict(e)
        for e in evidence
    ]

    return item


# ============================================================
# PATTERN DETECTION
# ============================================================

@app.post("/patterns/detect")
def detect_case_patterns():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM cases
        ORDER BY id DESC
        LIMIT 100
    """).fetchall()

    cases = [
        dict(r)
        for r in rows
    ]

    patterns = detect_patterns(
        cases
    )

    for pattern in patterns:

        if not isinstance(
            pattern,
            dict
        ):
            continue

        conn.execute("""
            INSERT INTO patterns
            (
                title,
                description,
                confidence,
                severity,
                case_count,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            sqlite_safe(
                pattern.get(
                    "title",
                    "Emerging pattern"
                ),
                "Emerging pattern"
            ),
            sqlite_safe(
                pattern.get(
                    "description",
                    ""
                ),
                ""
            ),
            pattern.get(
                "confidence",
                60
            ),
            sqlite_safe(
                pattern.get(
                    "severity",
                    "Medium"
                ),
                "Medium"
            ),
            pattern.get(
                "case_count",
                0
            ),
            "active",
            now()
        ))

    conn.commit()
    conn.close()

    audit(
        "system",
        "system",
        "DETECT_PATTERNS",
        "pattern",
        None,
        f"{len(patterns)} patterns detected"
    )

    return {
        "count": len(patterns),
        "patterns": patterns
    }


@app.get("/patterns")
def get_patterns():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM patterns
        ORDER BY id DESC
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# IMPACT LAB
# ============================================================

@app.post("/simulate")
def simulate(
    request: SimulationRequest
):

    conn = db()

    documents = conn.execute("""
        SELECT *
        FROM documents
    """).fetchall()

    docs = [
        dict(d)
        for d in documents
    ]

    result = simulate_scenario(
        request.title,
        request.scenario,
        docs
    )

    simulation_ids = []

    options = result.get(
        "options",
        []
    )

    if not isinstance(
        options,
        list
    ):
        options = []

    for option in options:

        if not isinstance(
            option,
            dict
        ):
            continue

        affected = json.dumps(
            option.get(
                "affected_areas",
                []
            ),
            ensure_ascii=False
        )

        consequences = json.dumps(
            option.get(
                "consequences",
                []
            ),
            ensure_ascii=False
        )

        recommendation = sqlite_safe(
            option.get(
                "reason",
                ""
            ),
            ""
        )

        cur = conn.execute("""
            INSERT INTO simulations
            (
                title,
                scenario,
                option_name,
                risk,
                impact,
                confidence,
                affected_areas,
                consequences,
                recommendation,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.title,
            request.scenario,
            sqlite_safe(
                option.get(
                    "name",
                    "Option"
                ),
                "Option"
            ),
            option.get(
                "risk",
                50
            ),
            option.get(
                "impact",
                50
            ),
            option.get(
                "confidence",
                60
            ),
            affected,
            consequences,
            recommendation,
            now()
        ))

        simulation_ids.append(
            cur.lastrowid
        )

    conn.commit()
    conn.close()

    audit(
        "system",
        "system",
        "RUN_SIMULATION",
        "simulation",
        None,
        request.title
    )

    return {
        "simulation_ids":
            simulation_ids,
        **result
    }


@app.get("/simulations")
def get_simulations():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM simulations
        ORDER BY id DESC
    """).fetchall()

    conn.close()

    result = []

    for row in rows:

        item = dict(row)

        try:
            item["affected_areas"] = json.loads(
                item["affected_areas"] or "[]"
            )
        except Exception:
            item["affected_areas"] = []

        try:
            item["consequences"] = json.loads(
                item["consequences"] or "[]"
            )
        except Exception:
            item["consequences"] = []

        result.append(item)

    return result


# ============================================================
# DECISION ROOM
# ============================================================

@app.post("/decisions")
def create_decision(
    request: DecisionRequest
):

    conn = db()

    cur = conn.execute("""
        INSERT INTO decisions
        (
            title,
            action,
            recommendation,
            risk,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?)
    """, (
        request.title,
        request.action,
        request.recommendation,
        request.risk,
        now()
    ))

    decision_id = cur.lastrowid

    conn.commit()
    conn.close()

    audit(
        "staff",
        "staff",
        "CREATE_DECISION",
        "decision",
        decision_id,
        request.title
    )

    return {
        "success": True,
        "decision_id":
            decision_id,
        "status": "pending"
    }


@app.get("/decisions")
def get_decisions():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM decisions
        ORDER BY
            CASE
                WHEN status='pending' THEN 0
                ELSE 1
            END,
            id DESC
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# MANAGER APPROVAL
# ============================================================

def verify_pin(
    pin: str
):

    demo_pin_hash = hashlib.sha256(
        b"2468"
    ).hexdigest()

    supplied_hash = hashlib.sha256(
        pin.encode()
    ).hexdigest()

    return (
        supplied_hash
        == demo_pin_hash
    )


@app.post("/decisions/approve")
def approve_decision(
    request: ApprovalRequest
):

    if not verify_pin(
        request.pin
    ):
        raise HTTPException(
            status_code=403,
            detail=
                "Invalid manager authorization"
        )

    conn = db()

    decision = conn.execute("""
        SELECT *
        FROM decisions
        WHERE id=?
    """, (
        request.decision_id,
    )).fetchone()

    if not decision:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    if decision["status"] != "pending":
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Decision already resolved"
        )

    conn.execute("""
        UPDATE decisions
        SET
            status='approved',
            approved_by=?,
            decided_at=?
        WHERE id=?
    """, (
        request.manager,
        now(),
        request.decision_id
    ))

    conn.commit()
    conn.close()

    audit(
        request.manager,
        "manager",
        "APPROVE_DECISION",
        "decision",
        request.decision_id,
        "Authorized execution"
    )

    return {
        "success": True,
        "status": "approved",
        "message":
            "Decision approved and authorized "
            "for execution."
    }


@app.post("/decisions/{decision_id}/reject")
def reject_decision(
    decision_id: int
):

    conn = db()

    decision = conn.execute("""
        SELECT *
        FROM decisions
        WHERE id=?
    """, (
        decision_id,
    )).fetchone()

    if not decision:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    conn.execute("""
        UPDATE decisions
        SET
            status='rejected',
            decided_at=?
        WHERE id=?
    """, (
        now(),
        decision_id
    ))

    conn.commit()
    conn.close()

    audit(
        "manager",
        "manager",
        "REJECT_DECISION",
        "decision",
        decision_id,
        "Decision rejected"
    )

    return {
        "success": True,
        "status": "rejected"
    }


# ============================================================
# OUTCOME / CLOSED LOOP
# ============================================================

@app.post("/outcomes")
def record_outcome(
    request: OutcomeRequest
):

    conn = db()

    decision = conn.execute("""
        SELECT *
        FROM decisions
        WHERE id=?
    """, (
        request.decision_id,
    )).fetchone()

    if not decision:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    change = (
        request.after_value
        - request.before_value
    )

    if change > 0:
        outcome_label = "Improved"
    elif change < 0:
        outcome_label = "Declined"
    else:
        outcome_label = (
            "No measurable change"
        )

    result = (
        request.result
        or outcome_label
    )

    cur = conn.execute("""
        INSERT INTO outcomes
        (
            decision_id,
            metric,
            before_value,
            after_value,
            unit,
            result,
            recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        request.decision_id,
        request.metric,
        request.before_value,
        request.after_value,
        request.unit,
        result,
        now()
    ))

    outcome_id = cur.lastrowid

    conn.commit()
    conn.close()

    audit(
        "staff",
        "staff",
        "RECORD_OUTCOME",
        "outcome",
        outcome_id,
        f"{request.metric}: {result}"
    )

    return {
        "success": True,
        "outcome_id":
            outcome_id,
        "change": change,
        "result": result
    }


@app.get("/outcomes")
def get_outcomes():

    conn = db()

    rows = conn.execute("""
        SELECT
            outcomes.*,
            decisions.title AS decision_title
        FROM outcomes
        LEFT JOIN decisions
            ON decisions.id=outcomes.decision_id
        ORDER BY outcomes.id DESC
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# AUDIT
# ============================================================

@app.get("/audit")
def get_audit():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM audit_logs
        ORDER BY id DESC
        LIMIT 200
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# CONFLICT DETECTION
# ============================================================

@app.get("/conflicts")
def get_conflicts():

    conn = db()

    rows = conn.execute("""
        SELECT *
        FROM conflicts
        ORDER BY
            CASE severity
                WHEN 'critical' THEN 0
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                ELSE 3
            END,
            id DESC
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/conflicts/detect")
def detect_conflicts():

    conn = db()

    documents = conn.execute("""
        SELECT *
        FROM documents
    """).fetchall()

    detected = []

    for document in documents:

        sections = conn.execute("""
            SELECT *
            FROM sections
            WHERE document_id=?
            ORDER BY section_no
        """, (
            document["id"],
        )).fetchall()

        for i in range(
            len(sections)
        ):

            for j in range(
                i + 1,
                len(sections)
            ):

                a = sections[i]["content"]
                b = sections[j]["content"]

                common_words = (
                    set(
                        re.findall(
                            r"\b[a-zA-Z]+\b",
                            a.lower()
                        )
                    )
                    &
                    set(
                        re.findall(
                            r"\b[a-zA-Z]+\b",
                            b.lower()
                        )
                    )
                )

                policy_words = {
                    "must",
                    "shall",
                    "deadline",
                    "required",
                    "limit",
                    "maximum",
                    "minimum",
                    "allowed",
                    "prohibited",
                    "policy"
                }

                if len(
                    common_words
                    & policy_words
                ) >= 1:

                    values_a = re.findall(
                        r"\b\d+(?:\.\d+)?\b|"
                        r"\b(?:monday|tuesday|"
                        r"wednesday|thursday|"
                        r"friday|saturday|"
                        r"sunday)\b",
                        a,
                        re.I
                    )

                    values_b = re.findall(
                        r"\b\d+(?:\.\d+)?\b|"
                        r"\b(?:monday|tuesday|"
                        r"wednesday|thursday|"
                        r"friday|saturday|"
                        r"sunday)\b",
                        b,
                        re.I
                    )

                    if (
                        values_a
                        and values_b
                        and values_a != values_b
                    ):

                        conn.execute("""
                            INSERT INTO conflicts
                            (
                                document_id,
                                section_a,
                                section_b,
                                topic,
                                value_a,
                                value_b,
                                severity,
                                explanation
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            document["id"],
                            sections[i]["id"],
                            sections[j]["id"],
                            "Potential policy/value conflict",
                            ", ".join(values_a),
                            ", ".join(values_b),
                            "high",
                            "Two sections contain different "
                            "values for a potentially related "
                            "policy or constraint."
                        ))

                        detected.append({
                            "document_id":
                                document["id"],
                            "section_a":
                                sections[i]["id"],
                            "section_b":
                                sections[j]["id"],
                            "value_a":
                                values_a,
                            "value_b":
                                values_b
                        })

    conn.commit()
    conn.close()

    audit(
        "system",
        "system",
        "DETECT_CONFLICTS",
        "conflict",
        None,
        f"{len(detected)} conflicts"
    )

    return {
        "count": len(detected),
        "conflicts": detected
    }


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def dashboard():

    conn = db()

    documents = conn.execute(
        "SELECT COUNT(*) AS c FROM documents"
    ).fetchone()["c"]

    cases = conn.execute(
        "SELECT COUNT(*) AS c FROM cases"
    ).fetchone()["c"]

    open_cases = conn.execute("""
        SELECT COUNT(*) AS c
        FROM cases
        WHERE status='open'
    """).fetchone()["c"]

    patterns = conn.execute(
        "SELECT COUNT(*) AS c FROM patterns"
    ).fetchone()["c"]

    pending_decisions = conn.execute("""
        SELECT COUNT(*) AS c
        FROM decisions
        WHERE status='pending'
    """).fetchone()["c"]

    conflicts = conn.execute(
        "SELECT COUNT(*) AS c FROM conflicts"
    ).fetchone()["c"]

    impacts = conn.execute(
        "SELECT COUNT(*) AS c FROM impacts"
    ).fetchone()["c"]

    outcomes = conn.execute(
        "SELECT COUNT(*) AS c FROM outcomes"
    ).fetchone()["c"]

    conn.close()

    return {
        "system_score":
            calculate_health(),
        "documents":
            documents,
        "cases":
            cases,
        "open_cases":
            open_cases,
        "patterns":
            patterns,
        "pending_decisions":
            pending_decisions,
        "conflicts":
            conflicts,
        "impacts":
            impacts,
        "outcomes":
            outcomes,
        "pulse": {
            "urgent_cases":
                open_cases,
            "emerging_patterns":
                patterns,
            "knowledge_risks":
                conflicts,
            "decisions_waiting":
                pending_decisions
        }
    }


# ============================================================
# KNOWLEDGE HEALTH
# ============================================================

@app.get("/knowledge-health")
def knowledge_health():

    conn = db()

    documents = conn.execute("""
        SELECT *
        FROM documents
    """).fetchall()

    total_sections = conn.execute("""
        SELECT COUNT(*) AS c
        FROM sections
    """).fetchone()["c"]

    impacted = conn.execute("""
        SELECT COUNT(*) AS c
        FROM impacts
        WHERE affected=1
    """).fetchone()["c"]

    conflict_count = conn.execute("""
        SELECT COUNT(*) AS c
        FROM conflicts
    """).fetchone()["c"]

    conn.close()

    score = 100

    if total_sections:

        score -= min(
            int(
                impacted
                / total_sections
                * 30
            ),
            30
        )

    score -= min(
        conflict_count * 5,
        25
    )

    return {
        "score":
            max(0, score),
        "documents":
            len(documents),
        "sections":
            total_sections,
        "impacted_sections":
            impacted,
        "conflicts":
            conflict_count
    }


# ============================================================
# RESET — DEVELOPMENT ONLY
# ============================================================

@app.delete("/reset")
def reset_database():

    conn = db()

    tables = [
        "documents",
        "sections",
        "cases",
        "evidence",
        "patterns",
        "simulations",
        "decisions",
        "audit_logs",
        "outcomes",
        "changes",
        "impacts",
        "versions",
        "conflicts"
    ]

    for table in tables:

        conn.execute(
            f"DELETE FROM {table}"
        )

    conn.commit()
    conn.close()

    for file in UPLOAD_DIR.iterdir():

        if file.is_file():

            try:
                file.unlink()
            except Exception:
                pass

    return {
        "success": True,
        "message":
            "RIPPLE development data reset."
    }