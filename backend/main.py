import os
import re
import json
import sqlite3
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any

import fitz
from docx import Document as DocxDocument
from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from google import genai
from google.genai import types


# ============================================================
# RIPPLE
# AI INVESTIGATION & DECISION INTELLIGENCE
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = BASE_DIR / "ripple.db"

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
    "",
).strip()

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash",
).strip()

gemini_client = None

if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )
    except Exception as exc:
        print(
            "Gemini initialization error:",
            exc,
        )
        gemini_client = None


app = FastAPI(
    title="RIPPLE",
    description=(
        "AI Investigation & Decision Intelligence Platform"
    ),
    version="2.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

def db():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
    )

    conn.row_factory = sqlite3.Row

    conn.execute(
        "PRAGMA foreign_keys = ON"
    )

    return conn


def table_columns(
    conn,
    table_name: str,
):
    rows = conn.execute(
        f"PRAGMA table_info({table_name})"
    ).fetchall()

    return {
        row["name"]
        for row in rows
    }


def add_column_if_missing(
    conn,
    table_name: str,
    column_name: str,
    definition: str,
):
    columns = table_columns(
        conn,
        table_name,
    )

    if column_name not in columns:

        conn.execute(
            f"""
            ALTER TABLE {table_name}
            ADD COLUMN {column_name}
            {definition}
            """
        )


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
            FOREIGN KEY(document_id)
            REFERENCES documents(id)
            ON DELETE CASCADE
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
            FOREIGN KEY(case_id)
            REFERENCES cases(id)
            ON DELETE CASCADE
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
            decided_at TEXT,
            execution_status TEXT DEFAULT 'not_executed',
            executed_at TEXT,
            execution_result TEXT
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
            recorded_at TEXT,
            FOREIGN KEY(decision_id)
            REFERENCES decisions(id)
            ON DELETE CASCADE
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
            status TEXT DEFAULT 'pending',
            FOREIGN KEY(change_id)
            REFERENCES changes(id)
            ON DELETE CASCADE,
            FOREIGN KEY(document_id)
            REFERENCES documents(id)
            ON DELETE CASCADE,
            FOREIGN KEY(section_id)
            REFERENCES sections(id)
            ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER,
            version INTEGER,
            change_summary TEXT,
            content_snapshot TEXT,
            created_at TEXT,
            FOREIGN KEY(document_id)
            REFERENCES documents(id)
            ON DELETE CASCADE
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
            explanation TEXT,
            created_at TEXT,
            FOREIGN KEY(document_id)
            REFERENCES documents(id)
            ON DELETE CASCADE,
            FOREIGN KEY(section_a)
            REFERENCES sections(id)
            ON DELETE CASCADE,
            FOREIGN KEY(section_b)
            REFERENCES sections(id)
            ON DELETE CASCADE
        )
    """)

    # --------------------------------------------------------
    # Migrate older RIPPLE databases safely
    # --------------------------------------------------------

    add_column_if_missing(
        conn,
        "decisions",
        "execution_status",
        "TEXT DEFAULT 'not_executed'",
    )

    add_column_if_missing(
        conn,
        "decisions",
        "executed_at",
        "TEXT",
    )

    add_column_if_missing(
        conn,
        "decisions",
        "execution_result",
        "TEXT",
    )

    add_column_if_missing(
        conn,
        "versions",
        "content_snapshot",
        "TEXT",
    )

    add_column_if_missing(
        conn,
        "conflicts",
        "created_at",
        "TEXT",
    )

    conn.commit()
    conn.close()


init_db()


# ============================================================
# MODELS
# ============================================================

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
    risk: float = Field(
        default=0,
        ge=0,
        le=100,
    )


class ApprovalRequest(BaseModel):

    decision_id: int
    manager: str
    pin: str


class RejectRequest(BaseModel):

    manager: str
    pin: str


class OutcomeRequest(BaseModel):

    decision_id: int
    metric: str
    before_value: float
    after_value: float
    unit: str = ""
    result: str = ""


class ImpactUpdate(BaseModel):

    status: str


class ChangeRequest(BaseModel):

    title: str
    old_value: str = ""
    new_value: str = ""


# ============================================================
# HELPERS
# ============================================================

def now():

    return datetime.now(
        timezone.utc
    ).isoformat()


def clean_text(
    text: str,
):

    text = text.replace(
        "\x00",
        " ",
    )

    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    text = re.sub(
        r"\n{3,}",
        "\n\n",
        text,
    )

    return text.strip()


def split_sections(
    text: str,
):

    sections = [
        part.strip()
        for part in re.split(
            r"\n\s*\n",
            text,
        )
        if part.strip()
    ]

    return sections or [text]


def sqlite_safe(
    value: Any,
    default="",
):

    if value is None:
        return default

    if isinstance(
        value,
        (list, dict),
    ):
        return json.dumps(
            value,
            ensure_ascii=False,
        )

    if isinstance(
        value,
        bool,
    ):
        return int(value)

    if isinstance(
        value,
        (str, int, float),
    ):
        return value

    return str(value)


def safe_number(
    value,
    default=50,
):

    if isinstance(
        value,
        (list, dict),
    ):
        return default

    try:

        number = float(value)

        if number != number:
            return default

        return number

    except (
        TypeError,
        ValueError,
    ):

        return default


def clamp_score(
    value,
    default=50,
):

    number = safe_number(
        value,
        default,
    )

    return max(
        0,
        min(
            100,
            number,
        ),
    )


def safe_list(
    value,
):

    if isinstance(
        value,
        list,
    ):

        return [
            str(item)
            for item in value
            if item is not None
        ]

    if isinstance(
        value,
        str,
    ):

        if not value.strip():
            return []

        return [value]

    return []


def safe_json(
    text,
):

    if not text:
        return {}

    if isinstance(
        text,
        dict,
    ):
        return text

    try:

        parsed = json.loads(
            text
        )

        if isinstance(
            parsed,
            dict,
        ):

            return parsed

    except Exception:
        pass

    # Remove markdown code fences
    cleaned = re.sub(
        r"```(?:json)?",
        "",
        str(text),
        flags=re.I,
    )

    cleaned = cleaned.replace(
        "```",
        "",
    ).strip()

    try:

        parsed = json.loads(
            cleaned
        )

        if isinstance(
            parsed,
            dict,
        ):

            return parsed

    except Exception:
        pass

    match = re.search(
        r"\{.*\}",
        cleaned,
        re.S,
    )

    if match:

        try:

            parsed = json.loads(
                match.group()
            )

            if isinstance(
                parsed,
                dict,
            ):

                return parsed

        except Exception:
            pass

    return {}


def similarity_score(
    a: str,
    b: str,
):

    a_words = set(
        re.findall(
            r"\b[a-zA-Z0-9]+\b",
            a.lower(),
        )
    )

    b_words = set(
        re.findall(
            r"\b[a-zA-Z0-9]+\b",
            b.lower(),
        )
    )

    if not a_words or not b_words:
        return 0

    return (
        len(a_words & b_words)
        /
        max(
            1,
            len(a_words | b_words),
        )
    )


def audit(
    actor,
    role,
    action,
    target_type,
    target_id=None,
    details="",
):

    conn = db()

    try:

        conn.execute("""
            INSERT INTO audit_logs
            (
                actor,
                role,
                action,
                target_type,
                target_id,
                details,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            sqlite_safe(actor, "system"),
            sqlite_safe(role, "system"),
            sqlite_safe(action),
            sqlite_safe(target_type),
            target_id,
            sqlite_safe(details),
            now(),
        ))

        conn.commit()

    finally:

        conn.close()


# ============================================================
# GEMINI
# ============================================================

def ask_ai(
    prompt: str,
):

    if not gemini_client:
        return {}

    try:

        response = (
            gemini_client
            .models
            .generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
        )

        if not response:
            return {}

        return safe_json(
            getattr(
                response,
                "text",
                "",
            )
        )

    except Exception as exc:

        print(
            "RIPPLE AI ERROR:",
            exc,
        )

        return {}


# ============================================================
# FILE EXTRACTION
# ============================================================

def extract_pdf(
    path: Path,
):

    document = fitz.open(
        path
    )

    pages = []

    try:

        for page in document:

            pages.append(
                page.get_text()
            )

    finally:

        document.close()

    return "\n\n".join(
        pages
    )


def extract_docx(
    path: Path,
):

    document = DocxDocument(
        path
    )

    paragraphs = []

    for paragraph in document.paragraphs:

        text = paragraph.text.strip()

        if text:
            paragraphs.append(text)

    return "\n\n".join(
        paragraphs
    )


def extract_text(
    path: Path,
):

    extension = path.suffix.lower()

    if extension == ".pdf":
        return extract_pdf(path)

    if extension == ".docx":
        return extract_docx(path)

    if extension in (
        ".txt",
        ".md",
    ):

        return path.read_text(
            encoding="utf-8",
            errors="ignore",
        )

    raise ValueError(
        "Unsupported file type"
    )


# ============================================================
# AI INVESTIGATION
# ============================================================

def investigate_case(
    title,
    description,
    documents,
):

    context_parts = []

    for document in documents:

        content = (
            document["content"]
            or ""
        )

        context_parts.append(
            f"""
DOCUMENT: {document["name"]}

{content[:5000]}
"""
        )

    context = "\n\n".join(
        context_parts
    )

    prompt = f"""
You are RIPPLE,
an AI Investigation and Decision
Intelligence engine.

Investigate the following operational problem.

TITLE:
{title}

DESCRIPTION:
{description}

ORGANIZATIONAL KNOWLEDGE:
{context}

Return ONLY valid JSON.

Required schema:

{{
  "summary": "...",
  "priority": "Immediate|High|Review|Low",
  "confidence": 0,
  "possible_root_causes": [
    {{
      "hypothesis": "...",
      "confidence": 0,
      "evidence": "..."
    }}
  ],
  "evidence": [
    {{
      "source_type": "document",
      "source_id": 0,
      "title": "...",
      "content": "...",
      "relevance": 0
    }}
  ],
  "affected_areas": [],
  "recommended_action": "...",
  "risk_score": 0,
  "reasoning": "..."
}}

Rules:

1. Confidence must be 0-100.
2. Risk score must be 0-100.
3. Do not claim causality without evidence.
4. Root causes are hypotheses.
5. Separate evidence from inference.
6. Identify direct and indirect relationships.
7. Do not invent document facts.
8. If evidence is insufficient, say so.
"""

    result = ask_ai(
        prompt
    )

    if result:
        return result

    return {
        "summary":
            description[:300],

        "priority":
            "High",

        "confidence":
            65,

        "possible_root_causes": [
            {
                "hypothesis":
                    "Possible process or workload bottleneck",

                "confidence":
                    55,

                "evidence":
                    "Requires additional evidence."
            }
        ],

        "evidence":
            [],

        "affected_areas": [
            "Operations"
        ],

        "recommended_action":
            (
                "Review the affected process "
                "and validate the available evidence."
            ),

        "risk_score":
            45,

        "reasoning":
            (
                "Initial analysis based on "
                "available case information."
            ),
    }


# ============================================================
# AI SIMULATION
# ============================================================

def normalize_simulation(
    result,
):

    if not isinstance(
        result,
        dict,
    ):

        return {}

    options = result.get(
        "options",
        [],
    )

    if not isinstance(
        options,
        list,
    ):

        options = []

    normalized = []

    for option in options:

        if not isinstance(
            option,
            dict,
        ):
            continue

        normalized.append({

            "name":
                str(
                    option.get(
                        "name",
                        "Unnamed option",
                    )
                ),

            "risk":
                clamp_score(
                    option.get(
                        "risk",
                        50,
                    ),
                    50,
                ),

            "impact":
                clamp_score(
                    option.get(
                        "impact",
                        50,
                    ),
                    50,
                ),

            "confidence":
                clamp_score(
                    option.get(
                        "confidence",
                        50,
                    ),
                    50,
                ),

            "affected_areas":
                safe_list(
                    option.get(
                        "affected_areas",
                        [],
                    )
                ),

            "consequences":
                safe_list(
                    option.get(
                        "consequences",
                        [],
                    )
                ),

            "required_actions":
                safe_list(
                    option.get(
                        "required_actions",
                        [],
                    )
                ),

            "reason":
                str(
                    option.get(
                        "reason",
                        "",
                    )
                ),
        })

    return {
        "options":
            normalized,

        "recommended_option":
            str(
                result.get(
                    "recommended_option",
                    "",
                )
            ),

        "recommendation_reason":
            str(
                result.get(
                    "recommendation_reason",
                    "",
                )
            ),

        "overall_risk":
            clamp_score(
                result.get(
                    "overall_risk",
                    50,
                ),
                50,
            ),
    }


def simulate_scenario(
    title,
    scenario,
    documents,
):

    context_parts = []

    for document in documents:

        context_parts.append(
            f"""
DOCUMENT: {document["name"]}

{(document["content"] or "")[:4000]}
"""
        )

    context = "\n\n".join(
        context_parts
    )

    prompt = f"""
You are RIPPLE's
Impact Simulation Engine.

PROBLEM:
{title}

PROPOSED CHANGE:
{scenario}

ORGANIZATIONAL KNOWLEDGE:
{context}

Simulate three possible paths.

Return ONLY valid JSON:

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

Rules:

- Risk is 0-100.
- Impact is 0-100.
- Confidence is 0-100.
- Results are estimates.
- Do not present estimates as guaranteed outcomes.
- Consider operational workload.
- Consider compliance and approval risk.
- Consider affected teams.
- Consider indirect consequences.
- Human approval remains required.
"""

    result = ask_ai(
        prompt
    )

    if result:

        normalized = normalize_simulation(
            result
        )

        if normalized.get(
            "options"
        ):

            return normalized

    return {
        "options": [

            {
                "name":
                    "Option A — Immediate change",

                "risk":
                    35,

                "impact":
                    78,

                "confidence":
                    64,

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

                "risk":
                    22,

                "impact":
                    70,

                "confidence":
                    72,

                "affected_areas": [
                    "Operations",
                    "Customer Support"
                ],

                "consequences": [
                    "Lower transition risk",
                    "Slower implementation"
                ],

                "required_actions": [
                    "Pilot the change",
                    "Measure results"
                ],

                "reason":
                    (
                        "Balances expected impact "
                        "and transition risk."
                    )
            },

            {
                "name":
                    "Option C — No immediate change",

                "risk":
                    68,

                "impact":
                    25,

                "confidence":
                    61,

                "affected_areas":
                    [],

                "consequences": [
                    "Existing problem may continue",
                    "Current process remains"
                ],

                "required_actions": [
                    "Continue monitoring"
                ],

                "reason":
                    (
                        "Avoids immediate disruption."
                    )
            },
        ],

        "recommended_option":
            "Option B — Controlled rollout",

        "recommendation_reason":
            (
                "It balances expected improvement "
                "with lower transition risk."
            ),

        "overall_risk":
            32,
    }


# ============================================================
# PATTERN DETECTION
# ============================================================

def detect_patterns(
    cases,
):

    if not cases:
        return []

    data = "\n".join(
        f"""
CASE:
{case["title"]}

CATEGORY:
{case["category"]}

DESCRIPTION:
{case["description"]}
"""
        for case in cases
    )

    prompt = f"""
You are RIPPLE's
Pattern Detection Engine.

Analyze the following investigations:

{data}

Find recurring operational signals.

Return ONLY valid JSON:

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

Important:

- Do not claim causality.
- Use "possible common factor".
- Use "observed correlation".
- Use "hypothesis".
- Confidence is 0-100.
- Do not invent evidence.
"""

    result = ask_ai(
        prompt
    )

    patterns = result.get(
        "patterns",
        [],
    )

    if not isinstance(
        patterns,
        list,
    ):

        return []

    normalized = []

    for pattern in patterns:

        if not isinstance(
            pattern,
            dict,
        ):
            continue

        normalized.append({

            "title":
                str(
                    pattern.get(
                        "title",
                        "Emerging operational pattern",
                    )
                ),

            "description":
                str(
                    pattern.get(
                        "description",
                        "",
                    )
                ),

            "confidence":
                clamp_score(
                    pattern.get(
                        "confidence",
                        50,
                    ),
                    50,
                ),

            "severity":
                str(
                    pattern.get(
                        "severity",
                        "Medium",
                    )
                ),

            "case_count":
                int(
                    safe_number(
                        pattern.get(
                            "case_count",
                            0,
                        ),
                        0,
                    )
                ),

            "status":
                "emerging",
        })

    return normalized


# ============================================================
# HEALTH
# ============================================================

def calculate_health():

    conn = db()

    try:

        documents = conn.execute("""
            SELECT COUNT(*) AS c
            FROM documents
        """).fetchone()["c"]

        pending = conn.execute("""
            SELECT COUNT(*) AS c
            FROM decisions
            WHERE status='pending'
        """).fetchone()["c"]

        conflicts = conn.execute("""
            SELECT COUNT(*) AS c
            FROM conflicts
        """).fetchone()["c"]

        failed_executions = conn.execute("""
            SELECT COUNT(*) AS c
            FROM decisions
            WHERE execution_status='failed'
        """).fetchone()["c"]

        score = 100

        if documents == 0:
            score -= 10

        score -= min(
            conflicts * 4,
            25,
        )

        score -= min(
            pending * 3,
            15,
        )

        score -= min(
            failed_executions * 10,
            30,
        )

        return max(
            0,
            min(
                100,
                score,
            )
        )

    finally:

        conn.close()


# ============================================================
# BASIC
# ============================================================

@app.get("/")
def root():

    return {
        "name":
            "RIPPLE",

        "description":
            "AI Investigation & Decision Intelligence",

        "status":
            "online",

        "version":
            "2.0.0",
    }


@app.get("/health")
def health():

    return {
        "status":
            "healthy",

        "system_score":
            calculate_health(),

        "ai":
            bool(gemini_client),

        "ai_mode":
            (
                "Gemini"
                if gemini_client
                else
                "Local fallback"
            ),

        "human_approval_required":
            True,
    }


# ============================================================
# DOCUMENTS
# ============================================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
):

    allowed = {
        ".pdf",
        ".docx",
        ".txt",
        ".md",
    }

    filename = (
        file.filename
        or
        "upload.txt"
    )

    extension = Path(
        filename
    ).suffix.lower()

    if extension not in allowed:

        raise HTTPException(
            status_code=400,
            detail=(
                "Supported files: "
                "PDF, DOCX, TXT, MD"
            ),
        )

    safe_name = re.sub(
        r"[^a-zA-Z0-9._-]",
        "_",
        Path(filename).name,
    )

    if not safe_name:
        safe_name = "upload.txt"

    path = (
        UPLOAD_DIR
        /
        safe_name
    )

    # Avoid accidental overwrite
    if path.exists():

        stem = path.stem
        suffix = path.suffix

        counter = 1

        while path.exists():

            path = (
                UPLOAD_DIR
                /
                f"{stem}_{counter}{suffix}"
            )

            counter += 1

    file_bytes = await file.read()

    if not file_bytes:

        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    try:

        path.write_bytes(
            file_bytes
        )

        content = clean_text(
            extract_text(path)
        )

    except Exception as exc:

        try:
            path.unlink()
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail=(
                f"Unable to extract document: {exc}"
            ),
        )

    if not content:

        try:
            path.unlink()
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text found in the file."
            ),
        )

    conn = db()

    try:

        cursor = conn.execute("""
            INSERT INTO documents
            (
                name,
                path,
                file_type,
                content,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            filename,
            str(path),
            extension,
            content,
            now(),
        ))

        document_id = cursor.lastrowid

        sections = split_sections(
            content
        )

        for index, section in enumerate(
            sections,
            1,
        ):

            first_line = (
                section
                .split("\n")[0]
                .strip()
            )

            title = (
                first_line[:100]
                if first_line
                else
                f"Section {index}"
            )

            conn.execute("""
                INSERT INTO sections
                (
                    document_id,
                    section_no,
                    title,
                    content
                )
                VALUES (?, ?, ?, ?)
            """, (
                document_id,
                index,
                title,
                section,
            ))

        conn.commit()

    except Exception:

        conn.rollback()

        try:
            path.unlink()
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail="Unable to store document.",
        )

    finally:

        conn.close()

    audit(
        "system",
        "system",
        "UPLOAD_DOCUMENT",
        "document",
        document_id,
        filename,
    )

    return {
        "success":
            True,

        "document_id":
            document_id,

        "name":
            filename,

        "sections":
            len(sections),

        "characters":
            len(content),
    }


@app.get("/documents")
def get_documents():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT
                id,
                name,
                file_type,
                created_at
            FROM documents
            ORDER BY id DESC
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# CASES
# ============================================================

@app.post("/cases")
def create_case(
    request: CaseRequest,
):

    title = request.title.strip()
    description = request.description.strip()
    category = (
        request.category
        or
        "Operational"
    ).strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Case title is required.",
        )

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Case description is required.",
        )

    conn = db()

    try:

        documents = conn.execute("""
            SELECT *
            FROM documents
        """).fetchall()

        docs = [
            dict(document)
            for document in documents
        ]

        analysis = investigate_case(
            title,
            description,
            docs,
        )

        priority = str(
            analysis.get(
                "priority",
                "Review",
            )
        )

        if priority not in {
            "Immediate",
            "High",
            "Review",
            "Low",
        }:

            priority = "Review"

        confidence = clamp_score(
            analysis.get(
                "confidence",
                65,
            ),
            65,
        )

        summary = sqlite_safe(
            analysis.get(
                "summary",
                "",
            )
        )

        root_causes = sqlite_safe(
            analysis.get(
                "possible_root_causes",
                [],
            ),
            "[]",
        )

        recommendation = sqlite_safe(
            analysis.get(
                "recommended_action",
                "",
            )
        )

        cursor = conn.execute("""
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
            title,
            description,
            category,
            priority,
            confidence,
            "open",
            summary,
            root_causes,
            recommendation,
            now(),
        ))

        case_id = cursor.lastrowid

        evidence_items = analysis.get(
            "evidence",
            [],
        )

        if not isinstance(
            evidence_items,
            list,
        ):

            evidence_items = []

        for evidence in evidence_items:

            if not isinstance(
                evidence,
                dict,
            ):
                continue

            source_id = evidence.get(
                "source_id"
            )

            try:
                source_id = (
                    int(source_id)
                    if source_id is not None
                    else None
                )
            except Exception:
                source_id = None

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

                sqlite_safe(
                    evidence.get(
                        "source_type",
                        "AI",
                    ),
                    "AI",
                ),

                source_id,

                sqlite_safe(
                    evidence.get(
                        "title",
                        "AI evidence",
                    ),
                    "AI evidence",
                ),

                sqlite_safe(
                    evidence.get(
                        "content",
                        "",
                    )
                ),

                clamp_score(
                    evidence.get(
                        "relevance",
                        60,
                    ),
                    60,
                ),
            ))

        conn.commit()

    except HTTPException:
        conn.rollback()
        raise

    except Exception as exc:

        conn.rollback()

        print(
            "RIPPLE CASE ERROR:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create case.",
        )

    finally:

        conn.close()

    audit(
        "user",
        "user",
        "CREATE_CASE",
        "case",
        case_id,
        title,
    )

    return {
        "case_id":
            case_id,

        "analysis":
            analysis,
    }


@app.get("/cases")
def get_cases():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM cases
            ORDER BY id DESC
        """).fetchall()

        result = []

        for row in rows:

            item = dict(row)

            try:

                item["root_cause"] = json.loads(
                    item["root_cause"]
                    or
                    "[]"
                )

            except Exception:

                item["root_cause"] = []

            result.append(item)

        return result

    finally:

        conn.close()


@app.get("/cases/{case_id}")
def get_case(
    case_id: int,
):

    conn = db()

    try:

        case = conn.execute("""
            SELECT *
            FROM cases
            WHERE id=?
        """, (
            case_id,
        )).fetchone()

        if not case:

            raise HTTPException(
                status_code=404,
                detail="Case not found",
            )

        evidence = conn.execute("""
            SELECT *
            FROM evidence
            WHERE case_id=?
            ORDER BY relevance DESC
        """, (
            case_id,
        )).fetchall()

        item = dict(case)

        try:

            item["root_cause"] = json.loads(
                item["root_cause"]
                or
                "[]"
            )

        except Exception:

            item["root_cause"] = []

        item["evidence"] = [
            dict(row)
            for row in evidence
        ]

        return item

    finally:

        conn.close()


# ============================================================
# PATTERNS
# ============================================================

@app.post("/patterns/detect")
def detect_case_patterns():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM cases
            ORDER BY id DESC
            LIMIT 100
        """).fetchall()

        cases = [
            dict(row)
            for row in rows
        ]

        patterns = detect_patterns(
            cases
        )

        inserted = []

        for pattern in patterns:

            title = sqlite_safe(
                pattern.get(
                    "title",
                    "Emerging pattern",
                ),
                "Emerging pattern",
            )

            description = sqlite_safe(
                pattern.get(
                    "description",
                    "",
                )
            )

            confidence = clamp_score(
                pattern.get(
                    "confidence",
                    50,
                ),
                50,
            )

            severity = str(
                pattern.get(
                    "severity",
                    "Medium",
                )
            )

            if severity not in {
                "Low",
                "Medium",
                "High",
                "Critical",
            }:

                severity = "Medium"

            case_count = int(
                safe_number(
                    pattern.get(
                        "case_count",
                        0,
                    ),
                    0,
                )
            )

            # Avoid identical duplicate patterns
            existing = conn.execute("""
                SELECT id
                FROM patterns
                WHERE title=?
                  AND description=?
            """, (
                title,
                description,
            )).fetchone()

            if existing:
                continue

            cursor = conn.execute("""
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
                title,
                description,
                confidence,
                severity,
                case_count,
                "active",
                now(),
            ))

            inserted.append(
                cursor.lastrowid
            )

        conn.commit()

    finally:

        conn.close()

    audit(
        "system",
        "system",
        "DETECT_PATTERNS",
        "pattern",
        None,
        f"{len(patterns)} patterns analyzed",
    )

    return {
        "count":
            len(patterns),

        "inserted":
            len(inserted),

        "patterns":
            patterns,
    }


@app.get("/patterns")
def get_patterns():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM patterns
            ORDER BY id DESC
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# SIMULATION
# ============================================================

@app.post("/simulate")
def simulate(
    request: SimulationRequest,
):

    title = request.title.strip()
    scenario = request.scenario.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Simulation title is required.",
        )

    if not scenario:
        raise HTTPException(
            status_code=400,
            detail="Simulation scenario is required.",
        )

    conn = db()

    try:

        documents = conn.execute("""
            SELECT *
            FROM documents
        """).fetchall()

        docs = [
            dict(document)
            for document in documents
        ]

        result = simulate_scenario(
            title,
            scenario,
            docs,
        )

        simulation_ids = []

        options = result.get(
            "options",
            [],
        )

        for option in options:

            affected = json.dumps(
                safe_list(
                    option.get(
                        "affected_areas",
                        [],
                    )
                ),
                ensure_ascii=False,
            )

            consequences = json.dumps(
                safe_list(
                    option.get(
                        "consequences",
                        [],
                    )
                ),
                ensure_ascii=False,
            )

            cursor = conn.execute("""
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
                title,
                scenario,

                sqlite_safe(
                    option.get(
                        "name",
                        "Option",
                    ),
                    "Option",
                ),

                clamp_score(
                    option.get(
                        "risk",
                        50,
                    ),
                    50,
                ),

                clamp_score(
                    option.get(
                        "impact",
                        50,
                    ),
                    50,
                ),

                clamp_score(
                    option.get(
                        "confidence",
                        60,
                    ),
                    60,
                ),

                affected,
                consequences,

                sqlite_safe(
                    option.get(
                        "reason",
                        "",
                    )
                ),

                now(),
            ))

            simulation_ids.append(
                cursor.lastrowid
            )

        conn.commit()

    finally:

        conn.close()

    audit(
        "system",
        "system",
        "RUN_SIMULATION",
        "simulation",
        None,
        title,
    )

    return {
        "simulation_ids":
            simulation_ids,

        **result,
    }


@app.get("/simulations")
def get_simulations():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM simulations
            ORDER BY id DESC
        """).fetchall()

        result = []

        for row in rows:

            item = dict(row)

            try:

                item["affected_areas"] = json.loads(
                    item["affected_areas"]
                    or
                    "[]"
                )

            except Exception:

                item["affected_areas"] = []

            try:

                item["consequences"] = json.loads(
                    item["consequences"]
                    or
                    "[]"
                )

            except Exception:

                item["consequences"] = []

            result.append(item)

        return result

    finally:

        conn.close()


# ============================================================
# DECISION ROOM
# ============================================================

@app.post("/decisions")
def create_decision(
    request: DecisionRequest,
):

    title = request.title.strip()
    action = request.action.strip()
    recommendation = (
        request.recommendation
        or
        ""
    ).strip()

    if not title:

        raise HTTPException(
            status_code=400,
            detail="Decision title is required.",
        )

    if not action:

        raise HTTPException(
            status_code=400,
            detail="Decision action is required.",
        )

    risk = clamp_score(
        request.risk,
        0,
    )

    conn = db()

    try:

        cursor = conn.execute("""
            INSERT INTO decisions
            (
                title,
                action,
                recommendation,
                risk,
                status,
                execution_status,
                created_at
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                'pending',
                'not_executed',
                ?
            )
        """, (
            title,
            action,
            recommendation,
            risk,
            now(),
        ))

        decision_id = cursor.lastrowid

        conn.commit()

    finally:

        conn.close()

    audit(
        "staff",
        "staff",
        "CREATE_DECISION",
        "decision",
        decision_id,
        title,
    )

    return {
        "success":
            True,

        "decision_id":
            decision_id,

        "status":
            "pending",
    }


@app.get("/decisions")
def get_decisions():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM decisions
            ORDER BY
                CASE
                    WHEN status='pending'
                    THEN 0
                    ELSE 1
                END,
                id DESC
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# MANAGER AUTHORIZATION
# ============================================================

DEMO_MANAGER_PIN_HASH = hashlib.sha256(
    b"2468"
).hexdigest()


def verify_pin(
    pin: str,
):

    if not pin:
        return False

    supplied_hash = hashlib.sha256(
        pin.encode()
    ).hexdigest()

    return (
        supplied_hash
        ==
        DEMO_MANAGER_PIN_HASH
    )


def require_manager(
    manager: str,
    pin: str,
):

    manager = (
        manager
        or
        ""
    ).strip()

    if not manager:

        raise HTTPException(
            status_code=403,
            detail=(
                "Manager identity is required."
            ),
        )

    if not verify_pin(
        pin
    ):

        raise HTTPException(
            status_code=403,
            detail=(
                "Invalid manager authorization."
            ),
        )

    return manager


# ============================================================
# EXECUTION HELPERS
# ============================================================

def find_affected_sections_for_decision(
    conn,
    decision,
):

    action_text = (
        f"{decision['title']} "
        f"{decision['action']} "
        f"{decision['recommendation'] or ''}"
    )

    documents = conn.execute("""
        SELECT *
        FROM documents
    """).fetchall()

    affected = []

    for document in documents:

        sections = conn.execute("""
            SELECT *
            FROM sections
            WHERE document_id=?
            ORDER BY section_no
        """, (
            document["id"],
        )).fetchall()

        for section in sections:

            content = (
                section["content"]
                or
                ""
            )

            score = similarity_score(
                action_text,
                content,
            )

            if (
                action_text.lower()
                and
                action_text.lower()
                in
                content.lower()
            ):

                score = max(
                    score,
                    0.85,
                )

            if score >= 0.05:

                affected.append({
                    "document":
                        document,

                    "section":
                        section,

                    "confidence":
                        min(
                            100,
                            score * 100,
                        ),
                })

    return affected


def create_versions_for_affected_sections(
    conn,
    affected,
    decision,
):

    created_versions = []

    grouped = {}

    for item in affected:

        document_id = item[
            "document"
        ]["id"]

        grouped.setdefault(
            document_id,
            []
        ).append(item)

    for document_id, items in grouped.items():

        document = items[0][
            "document"
        ]

        current = conn.execute("""
            SELECT MAX(version) AS version
            FROM versions
            WHERE document_id=?
        """, (
            document_id,
        )).fetchone()

        previous_version = int(
            current["version"]
            or
            0
        )

        new_version = (
            previous_version
            +
            1
        )

        section_numbers = [
            item["section"]["section_no"]
            for item in items
        ]

        summary = (
            f"Decision #{decision['id']} "
            f"executed. Updated affected "
            f"knowledge sections: "
            f"{', '.join(map(str, section_numbers))}."
        )

        cursor = conn.execute("""
            INSERT INTO versions
            (
                document_id,
                version,
                change_summary,
                content_snapshot,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            document_id,
            new_version,
            summary,
            document["content"],
            now(),
        ))

        created_versions.append({
            "version_id":
                cursor.lastrowid,

            "document_id":
                document_id,

            "document_name":
                document["name"],

            "version":
                new_version,

            "sections":
                section_numbers,
        })

    return created_versions


# ============================================================
# APPROVE + EXECUTE
# ============================================================

@app.post("/decisions/approve")
def approve_decision(
    request: ApprovalRequest,
):

    manager_name = require_manager(
        request.manager,
        request.pin,
    )

    conn = db()

    try:

        decision = conn.execute("""
            SELECT *
            FROM decisions
            WHERE id=?
        """, (
            request.decision_id,
        )).fetchone()

        if not decision:

            raise HTTPException(
                status_code=404,
                detail="Decision not found.",
            )

        if decision["status"] != "pending":

            raise HTTPException(
                status_code=400,
                detail=(
                    "Only pending decisions "
                    "can be approved."
                ),
            )

        decision_time = now()

        # ----------------------------------------------------
        # Find actual knowledge/process areas affected
        # ----------------------------------------------------

        affected = (
            find_affected_sections_for_decision(
                conn,
                decision,
            )
        )

        # ----------------------------------------------------
        # Create change record
        # ----------------------------------------------------

        cursor = conn.execute("""
            INSERT INTO changes
            (
                title,
                old_value,
                new_value,
                created_at
            )
            VALUES (?, ?, ?, ?)
        """, (
            decision["title"],
            "Current operational state",
            decision["action"],
            decision_time,
        ))

        change_id = cursor.lastrowid

        # ----------------------------------------------------
        # Store impact records
        # ----------------------------------------------------

        for item in affected:

            conn.execute("""
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                change_id,

                item["document"]["id"],

                item["section"]["id"],

                1,

                item["confidence"],

                (
                    "Knowledge section is "
                    "potentially affected by "
                    "the approved decision."
                ),

                (
                    "Review and update this "
                    "section to reflect the "
                    "approved operational change."
                ),

                item["section"]["content"][:1000],

                "approved",
            ))

        # ----------------------------------------------------
        # Create versions ONLY for affected documents
        # ----------------------------------------------------

        versions = (
            create_versions_for_affected_sections(
                conn,
                affected,
                decision,
            )
        )

        # ----------------------------------------------------
        # Mark decision approved + executed
        # ----------------------------------------------------

        execution_result = (
            "Approved by authorized manager. "
            "Change executed. "
            f"{len(affected)} affected knowledge "
            f"sections identified. "
            f"{len(versions)} document version(s) created."
        )

        conn.execute("""
            UPDATE decisions
            SET
                status='approved',
                approved_by=?,
                decided_at=?,
                execution_status='executed',
                executed_at=?,
                execution_result=?
            WHERE id=?
        """, (
            manager_name,
            decision_time,
            decision_time,
            execution_result,
            request.decision_id,
        ))

        # ----------------------------------------------------
        # Audit
        # ----------------------------------------------------

        conn.execute("""
            INSERT INTO audit_logs
            (
                actor,
                role,
                action,
                target_type,
                target_id,
                details,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            manager_name,
            "manager",
            "EXECUTE_DECISION",
            "decision",
            request.decision_id,
            (
                f"Decision approved and executed. "
                f"Change ID={change_id}; "
                f"Affected sections={len(affected)}; "
                f"Versions created={len(versions)}."
            ),
            decision_time,
        ))

        conn.commit()

        return {
            "success":
                True,

            "status":
                "approved",

            "execution_status":
                "executed",

            "change_id":
                change_id,

            "affected_sections":
                len(affected),

            "versions_created":
                len(versions),

            "versions":
                versions,

            "message":
                (
                    "Decision approved, "
                    "executed, versioned "
                    "and audited."
                ),
        }

    except HTTPException:

        conn.rollback()
        raise

    except Exception as exc:

        conn.rollback()

        print(
            "RIPPLE EXECUTION ERROR:",
            exc,
        )

        # Try to mark failed execution
        try:

            conn.execute("""
                UPDATE decisions
                SET
                    execution_status='failed',
                    execution_result=?
                WHERE id=?
            """, (
                str(exc)[:500],
                request.decision_id,
            ))

            conn.commit()

        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=(
                "Decision execution failed safely."
            ),
        )

    finally:

        conn.close()


# ============================================================
# REJECT
# ============================================================

@app.post(
    "/decisions/{decision_id}/reject"
)
def reject_decision(
    decision_id: int,
    request: RejectRequest,
):

    manager_name = require_manager(
        request.manager,
        request.pin,
    )

    conn = db()

    try:

        decision = conn.execute("""
            SELECT *
            FROM decisions
            WHERE id=?
        """, (
            decision_id,
        )).fetchone()

        if not decision:

            raise HTTPException(
                status_code=404,
                detail="Decision not found.",
            )

        if decision["status"] != "pending":

            raise HTTPException(
                status_code=400,
                detail=(
                    "Only pending decisions "
                    "can be rejected."
                ),
            )

        decision_time = now()

        conn.execute("""
            UPDATE decisions
            SET
                status='rejected',
                approved_by=?,
                decided_at=?,
                execution_status='not_executed'
            WHERE id=?
        """, (
            manager_name,
            decision_time,
            decision_id,
        ))

        conn.execute("""
            INSERT INTO audit_logs
            (
                actor,
                role,
                action,
                target_type,
                target_id,
                details,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            manager_name,
            "manager",
            "REJECT_DECISION",
            "decision",
            decision_id,
            "Decision rejected by authorized manager.",
            decision_time,
        ))

        conn.commit()

        return {
            "success":
                True,

            "status":
                "rejected",
        }

    except HTTPException:

        conn.rollback()
        raise

    finally:

        conn.close()


# ============================================================
# OUTCOMES
# ============================================================

LOWER_IS_BETTER_KEYWORDS = {
    "time",
    "delay",
    "latency",
    "cost",
    "error",
    "errors",
    "failure",
    "failures",
    "complaint",
    "complaints",
    "backlog",
    "wait",
    "waiting",
    "processing time",
    "processing delay",
    "defect",
    "defects",
}


def determine_outcome(
    metric: str,
    before: float,
    after: float,
):

    metric_lower = (
        metric
        .strip()
        .lower()
    )

    lower_is_better = any(
        keyword in metric_lower
        for keyword
        in LOWER_IS_BETTER_KEYWORDS
    )

    change = after - before

    if change == 0:

        result = (
            "No measurable change"
        )

    elif lower_is_better:

        result = (
            "Improved"
            if change < 0
            else
            "Declined"
        )

    else:

        result = (
            "Improved"
            if change > 0
            else
            "Declined"
        )

    return (
        result,
        change,
        lower_is_better,
    )


@app.post("/outcomes")
def record_outcome(
    request: OutcomeRequest,
):

    metric = request.metric.strip()

    if not metric:

        raise HTTPException(
            status_code=400,
            detail="Metric is required.",
        )

    conn = db()

    try:

        decision = conn.execute("""
            SELECT *
            FROM decisions
            WHERE id=?
        """, (
            request.decision_id,
        )).fetchone()

        if not decision:

            raise HTTPException(
                status_code=404,
                detail="Decision not found.",
            )

        if decision["status"] != "approved":

            raise HTTPException(
                status_code=400,
                detail=(
                    "Outcome can only be recorded "
                    "after an approved decision."
                ),
            )

        if decision["execution_status"] not in (
            "executed",
            None,
        ):

            raise HTTPException(
                status_code=400,
                detail=(
                    "Decision has not been executed."
                ),
            )

        (
            result,
            change,
            lower_is_better,
        ) = determine_outcome(
            metric,
            request.before_value,
            request.after_value,
        )

        if request.result.strip():

            result = request.result.strip()

        cursor = conn.execute("""
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
            metric,
            request.before_value,
            request.after_value,
            request.unit.strip(),
            result,
            now(),
        ))

        outcome_id = cursor.lastrowid

        conn.commit()

    except HTTPException:

        conn.rollback()
        raise

    except Exception as exc:

        conn.rollback()

        print(
            "RIPPLE OUTCOME ERROR:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to record outcome safely."
            ),
        )

    finally:

        conn.close()

    audit(
        "staff",
        "staff",
        "RECORD_OUTCOME",
        "outcome",
        outcome_id,
        (
            f"{metric}: "
            f"{request.before_value} -> "
            f"{request.after_value} "
            f"({result})"
        ),
    )

    return {
        "success":
            True,

        "outcome_id":
            outcome_id,

        "before":
            request.before_value,

        "after":
            request.after_value,

        "change":
            change,

        "direction":
            (
                "lower_is_better"
                if lower_is_better
                else
                "higher_is_better"
            ),

        "result":
            result,
    }


@app.get("/outcomes")
def get_outcomes():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT
                outcomes.*,
                decisions.title
                AS decision_title
            FROM outcomes
            LEFT JOIN decisions
                ON decisions.id =
                   outcomes.decision_id
            ORDER BY outcomes.id DESC
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# AUDIT
# ============================================================

@app.get("/audit")
def get_audit():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM audit_logs
            ORDER BY id DESC
            LIMIT 200
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# CONFLICT DETECTION
# ============================================================

POLICY_WORDS = {
    "must",
    "shall",
    "required",
    "deadline",
    "limit",
    "maximum",
    "minimum",
    "allowed",
    "prohibited",
    "policy",
    "approval",
    "hours",
    "days",
}


@app.post("/conflicts/detect")
def detect_conflicts():

    conn = db()

    detected = []

    try:

        documents = conn.execute("""
            SELECT *
            FROM documents
        """).fetchall()

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

                    first = (
                        sections[i]["content"]
                        or
                        ""
                    )

                    second = (
                        sections[j]["content"]
                        or
                        ""
                    )

                    first_words = set(
                        re.findall(
                            r"\b[a-zA-Z]+\b",
                            first.lower(),
                        )
                    )

                    second_words = set(
                        re.findall(
                            r"\b[a-zA-Z]+\b",
                            second.lower(),
                        )
                    )

                    shared_policy = (
                        first_words
                        &
                        second_words
                        &
                        POLICY_WORDS
                    )

                    if not shared_policy:
                        continue

                    values_a = re.findall(
                        r"\b\d+(?:\.\d+)?\b",
                        first,
                    )

                    values_b = re.findall(
                        r"\b\d+(?:\.\d+)?\b",
                        second,
                    )

                    if not values_a or not values_b:
                        continue

                    if values_a == values_b:
                        continue

                    value_a = ", ".join(
                        values_a
                    )

                    value_b = ", ".join(
                        values_b
                    )

                    existing = conn.execute("""
                        SELECT id
                        FROM conflicts
                        WHERE document_id=?
                          AND section_a=?
                          AND section_b=?
                          AND value_a=?
                          AND value_b=?
                    """, (
                        document["id"],
                        sections[i]["id"],
                        sections[j]["id"],
                        value_a,
                        value_b,
                    )).fetchone()

                    if existing:
                        continue

                    explanation = (
                        "Potential conflict detected: "
                        "related policy language contains "
                        "different numeric constraints. "
                        "Human review is required before "
                        "treating this as a confirmed conflict."
                    )

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
                            explanation,
                            created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        document["id"],
                        sections[i]["id"],
                        sections[j]["id"],
                        "Potential policy/value conflict",
                        value_a,
                        value_b,
                        "high",
                        explanation,
                        now(),
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
                            values_b,

                        "severity":
                            "high",

                        "explanation":
                            explanation,
                    })

        conn.commit()

    finally:

        conn.close()

    audit(
        "system",
        "system",
        "DETECT_CONFLICTS",
        "conflict",
        None,
        f"{len(detected)} new conflicts",
    )

    return {
        "count":
            len(detected),

        "conflicts":
            detected,
    }


@app.get("/conflicts")
def get_conflicts():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT *
            FROM conflicts
            ORDER BY id DESC
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# CHANGES / IMPACTS
# ============================================================

@app.post("/changes")
def create_change(
    request: ChangeRequest,
):

    title = request.title.strip()

    if not title:

        raise HTTPException(
            status_code=400,
            detail="Change title is required.",
        )

    old_value = request.old_value.strip()
    new_value = request.new_value.strip()

    conn = db()

    try:

        cursor = conn.execute("""
            INSERT INTO changes
            (
                title,
                old_value,
                new_value,
                created_at
            )
            VALUES (?, ?, ?, ?)
        """, (
            title,
            old_value,
            new_value,
            now(),
        ))

        change_id = cursor.lastrowid

        documents = conn.execute("""
            SELECT *
            FROM documents
        """).fetchall()

        results = []

        search_text = (
            f"{title} "
            f"{old_value} "
            f"{new_value}"
        ).strip()

        for document in documents:

            sections = conn.execute("""
                SELECT *
                FROM sections
                WHERE document_id=?
                ORDER BY section_no
            """, (
                document["id"],
            )).fetchall()

            for section in sections:

                content = (
                    section["content"]
                    or
                    ""
                )

                score = similarity_score(
                    search_text,
                    content,
                )

                if (
                    old_value
                    and
                    old_value.lower()
                    in
                    content.lower()
                ):

                    score = max(
                        score,
                        0.8,
                    )

                if (
                    new_value
                    and
                    new_value.lower()
                    in
                    content.lower()
                ):

                    score = max(
                        score,
                        0.8,
                    )

                if score < 0.05:
                    continue

                confidence = min(
                    100,
                    score * 100,
                )

                reason = (
                    "Potential direct or semantic "
                    "relationship detected."
                )

                existing = conn.execute("""
                    SELECT id
                    FROM impacts
                    WHERE change_id=?
                      AND document_id=?
                      AND section_id=?
                """, (
                    change_id,
                    document["id"],
                    section["id"],
                )).fetchone()

                if existing:
                    continue

                conn.execute("""
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
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    change_id,
                    document["id"],
                    section["id"],
                    1,
                    confidence,
                    reason,
                    (
                        "Review this section before "
                        "implementing the change."
                    ),
                    content[:1000],
                    "pending",
                ))

                results.append({
                    "document_id":
                        document["id"],

                    "document_name":
                        document["name"],

                    "section_id":
                        section["id"],

                    "confidence":
                        confidence,

                    "reason":
                        reason,

                    "matched_text":
                        content[:500],
                })

        conn.commit()

    finally:

        conn.close()

    audit(
        "user",
        "user",
        "ANALYZE_CHANGE",
        "change",
        change_id,
        title,
    )

    return {
        "change_id":
            change_id,

        "blast_radius":
            len(results),

        "results":
            results,
    }


@app.get("/impacts/{change_id}")
def get_impacts(
    change_id: int,
):

    conn = db()

    try:

        rows = conn.execute("""
            SELECT
                impacts.*,
                documents.name AS document_name,
                sections.section_no,
                sections.content
                AS section_content
            FROM impacts
            JOIN documents
                ON documents.id =
                   impacts.document_id
            JOIN sections
                ON sections.id =
                   impacts.section_id
            WHERE impacts.change_id=?
            ORDER BY impacts.confidence DESC
        """, (
            change_id,
        )).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


@app.patch("/impacts/{impact_id}")
def update_impact(
    impact_id: int,
    request: ImpactUpdate,
):

    allowed_statuses = {
        "pending",
        "reviewed",
        "approved",
        "resolved",
        "rejected",
    }

    if request.status not in allowed_statuses:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid impact status."
            ),
        )

    conn = db()

    try:

        impact = conn.execute("""
            SELECT *
            FROM impacts
            WHERE id=?
        """, (
            impact_id,
        )).fetchone()

        if not impact:

            raise HTTPException(
                status_code=404,
                detail="Impact not found",
            )

        conn.execute("""
            UPDATE impacts
            SET status=?
            WHERE id=?
        """, (
            request.status,
            impact_id,
        ))

        conn.commit()

    finally:

        conn.close()

    audit(
        "manager",
        "manager",
        "UPDATE_IMPACT",
        "impact",
        impact_id,
        request.status,
    )

    return {
        "success":
            True,

        "status":
            request.status,
    }


# ============================================================
# VERSIONS
# ============================================================

@app.get("/versions")
def get_versions():

    conn = db()

    try:

        rows = conn.execute("""
            SELECT
                versions.*,
                documents.name
                AS document_name
            FROM versions
            LEFT JOIN documents
                ON documents.id =
                   versions.document_id
            ORDER BY versions.id DESC
        """).fetchall()

        return [
            dict(row)
            for row in rows
        ]

    finally:

        conn.close()


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def dashboard():

    conn = db()

    try:

        documents = conn.execute("""
            SELECT COUNT(*) AS c
            FROM documents
        """).fetchone()["c"]

        cases = conn.execute("""
            SELECT COUNT(*) AS c
            FROM cases
        """).fetchone()["c"]

        open_cases = conn.execute("""
            SELECT COUNT(*) AS c
            FROM cases
            WHERE status='open'
        """).fetchone()["c"]

        patterns = conn.execute("""
            SELECT COUNT(*) AS c
            FROM patterns
        """).fetchone()["c"]

        pending_decisions = conn.execute("""
            SELECT COUNT(*) AS c
            FROM decisions
            WHERE status='pending'
        """).fetchone()["c"]

        conflicts = conn.execute("""
            SELECT COUNT(*) AS c
            FROM conflicts
        """).fetchone()["c"]

        impacts = conn.execute("""
            SELECT COUNT(*) AS c
            FROM impacts
            WHERE affected=1
        """).fetchone()["c"]

        outcomes = conn.execute("""
            SELECT COUNT(*) AS c
            FROM outcomes
        """).fetchone()["c"]

        executed_decisions = conn.execute("""
            SELECT COUNT(*) AS c
            FROM decisions
            WHERE execution_status='executed'
        """).fetchone()["c"]

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

            "executed_decisions":
                executed_decisions,

            "pulse": {
                "urgent_cases":
                    open_cases,

                "emerging_patterns":
                    patterns,

                "knowledge_risks":
                    conflicts,

                "decisions_waiting":
                    pending_decisions,
            },
        }

    finally:

        conn.close()


# ============================================================
# KNOWLEDGE HEALTH
# ============================================================

@app.get("/knowledge-health")
def knowledge_health():

    conn = db()

    try:

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

        conflicts = conn.execute("""
            SELECT COUNT(*) AS c
            FROM conflicts
        """).fetchone()["c"]

        score = 100

        if total_sections:

            score -= min(
                int(
                    impacted
                    /
                    total_sections
                    *
                    30
                ),
                30,
            )

        score -= min(
            conflicts * 5,
            25,
        )

        return {
            "score":
                max(
                    0,
                    score,
                ),

            "documents":
                len(documents),

            "sections":
                total_sections,

            "impacted_sections":
                impacted,

            "conflicts":
                conflicts,
        }

    finally:

        conn.close()


# ============================================================
# DEVELOPMENT RESET
# ============================================================

@app.delete("/reset")
def reset_database():

    conn = db()

    tables = [
        "evidence",
        "outcomes",
        "impacts",
        "versions",
        "conflicts",
        "audit_logs",
        "simulations",
        "decisions",
        "patterns",
        "cases",
        "sections",
        "changes",
        "documents",
    ]

    try:

        for table in tables:

            conn.execute(
                f"DELETE FROM {table}"
            )

        conn.commit()

    finally:

        conn.close()

    for file in UPLOAD_DIR.iterdir():

        if file.is_file():

            try:
                file.unlink()
            except Exception:
                pass

    return {
        "success":
            True,

        "message":
            "RIPPLE development data reset.",
    }