import os
import re
import json
import shutil
import sqlite3
from pathlib import Path
from typing import Optional

import fitz
from docx import Document as DocxDocument
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from google import genai
from google.genai import types


# ============================================================
# CONFIGURATION
# ============================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
)

BASE_DIR = Path(__file__).resolve().parent

UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DATABASE_PATH = BASE_DIR / "ripple.db"


# ============================================================
# GEMINI CLIENT
# ============================================================

gemini_client = None

if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )
        print("Gemini AI: CONNECTED")
    except Exception as error:
        print("Gemini initialization error:", error)
else:
    print("Gemini AI: API KEY NOT FOUND")


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="RIPPLE API",
    description="AI Knowledge Impact & Change Intelligence Platform",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

def get_db():

    connection = sqlite3.connect(
        DATABASE_PATH
    )

    connection.row_factory = sqlite3.Row

    return connection


def init_database():

    db = get_db()

    cursor = db.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_type TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            page_number INTEGER,
            section_title TEXT,
            content TEXT NOT NULL,
            FOREIGN KEY(document_id)
                REFERENCES documents(id)
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            old_value TEXT NOT NULL,
            new_value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS impacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            change_id INTEGER NOT NULL,
            document_id INTEGER NOT NULL,
            section_id INTEGER NOT NULL,
            affected INTEGER NOT NULL,
            confidence REAL NOT NULL,
            reason TEXT,
            suggested_fix TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(change_id)
                REFERENCES changes(id),
            FOREIGN KEY(document_id)
                REFERENCES documents(id),
            FOREIGN KEY(section_id)
                REFERENCES sections(id)
        )
        """
    )

    db.commit()
    db.close()


init_database()


# ============================================================
# MODELS
# ============================================================

class ChangeRequest(BaseModel):

    title: str
    old_value: str
    new_value: str


class ImpactDecision(BaseModel):

    status: str


# ============================================================
# TEXT EXTRACTION
# ============================================================

def clean_text(text: str) -> str:

    text = text.replace("\x00", " ")

    text = re.sub(
        r"[ \t]+",
        " ",
        text
    )

    text = re.sub(
        r"\n{3,}",
        "\n\n",
        text
    )

    return text.strip()


def detect_title(text: str) -> str:

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    if not lines:
        return "Untitled Section"

    first_line = lines[0]

    if len(first_line) <= 100:
        return first_line

    return "Knowledge Section"


# ============================================================
# PDF EXTRACTION
# ============================================================

def extract_pdf(file_path: Path):

    sections = []

    pdf = fitz.open(file_path)

    for page_index, page in enumerate(pdf):

        text = page.get_text()

        text = clean_text(text)

        if not text:
            continue

        title = detect_title(text)

        sections.append(
            {
                "page_number": page_index + 1,
                "section_title": title,
                "content": text
            }
        )

    pdf.close()

    return sections


# ============================================================
# DOCX EXTRACTION
# ============================================================

def extract_docx(file_path: Path):

    document = DocxDocument(
        file_path
    )

    sections = []

    current_text = []
    current_title = "Document Section"

    for paragraph in document.paragraphs:

        text = paragraph.text.strip()

        if not text:
            continue

        if (
            paragraph.style
            and paragraph.style.name
            and "Heading" in paragraph.style.name
        ):

            if current_text:

                sections.append(
                    {
                        "page_number": None,
                        "section_title": current_title,
                        "content": "\n".join(
                            current_text
                        )
                    }
                )

            current_title = text
            current_text = []

        else:

            current_text.append(text)

    if current_text:

        sections.append(
            {
                "page_number": None,
                "section_title": current_title,
                "content": "\n".join(
                    current_text
                )
            }
        )

    return sections


# ============================================================
# TXT / MD EXTRACTION
# ============================================================

def extract_text_file(file_path: Path):

    text = file_path.read_text(
        encoding="utf-8",
        errors="ignore"
    )

    text = clean_text(text)

    if not text:
        return []

    paragraphs = [
        p.strip()
        for p in text.split("\n\n")
        if p.strip()
    ]

    sections = []

    for index, paragraph in enumerate(
        paragraphs
    ):

        sections.append(
            {
                "page_number": index + 1,
                "section_title": detect_title(
                    paragraph
                ),
                "content": paragraph
            }
        )

    return sections


# ============================================================
# UNIVERSAL EXTRACTION
# ============================================================

def extract_document(file_path: Path):

    extension = file_path.suffix.lower()

    if extension == ".pdf":

        return extract_pdf(file_path)

    if extension == ".docx":

        return extract_docx(file_path)

    if extension in [".txt", ".md"]:

        return extract_text_file(
            file_path
        )

    raise ValueError(
        "Unsupported file type. "
        "Use PDF, DOCX, TXT or MD."
    )


# ============================================================
# GEMINI ANALYSIS
# ============================================================

def ai_analyze_change(
    title: str,
    old_value: str,
    new_value: str,
    section_title: str,
    content: str
):

    if not gemini_client:

        return None

    prompt = f"""
You are RIPPLE, an AI Knowledge Impact
and Change Intelligence system.

Your job is to determine whether a knowledge
section becomes outdated or incorrect because
of a policy/rule change.

CHANGE:

Title:
{title}

Old value:
{old_value}

New value:
{new_value}


KNOWLEDGE SECTION:

Section title:
{section_title}

Content:
{content}


IMPORTANT RULES:

1. Analyze semantic meaning, not just exact words.
2. A section can be affected even if it does not
   contain the exact old value.
3. Consider dates, deadlines, rules, requirements,
   procedures and dependencies.
4. Do not mark a section affected merely because
   it discusses the same general topic.
5. If affected, explain the exact relationship.
6. If affected, produce a corrected version.
7. Preserve the original meaning and style where possible.
8. Never invent unrelated policy information.


Return ONLY JSON with exactly these fields:

{{
    "affected": true,
    "confidence": 0.95,
    "reason": "The section depends on the changed deadline.",
    "suggested_fix": "The corrected section text."
}}

For an unaffected section:

{{
    "affected": false,
    "confidence": 0.05,
    "reason": "The section does not depend on the changed rule.",
    "suggested_fix": ""
}}

Confidence must be a number from 0 to 1.
"""

    try:

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json"
            )
        )

        raw = response.text

        if not raw:
            return None

        result = json.loads(raw)

        affected = bool(
            result.get(
                "affected",
                False
            )
        )

        confidence = float(
            result.get(
                "confidence",
                0
            )
        )

        confidence = max(
            0,
            min(
                confidence,
                1
            )
        )

        reason = str(
            result.get(
                "reason",
                ""
            )
        )

        suggested_fix = str(
            result.get(
                "suggested_fix",
                ""
            )
        )

        return {
            "affected": affected,
            "confidence": confidence,
            "reason": reason,
            "suggested_fix": suggested_fix
        }

    except Exception as error:

        print(
            "Gemini analysis error:",
            error
        )

        return None


# ============================================================
# FALLBACK LOCAL ANALYSIS
# ============================================================

def local_analyze_change(
    old_value: str,
    new_value: str,
    content: str
):

    content_lower = content.lower()

    old_lower = old_value.lower()

    new_lower = new_value.lower()

    old_words = set(
        re.findall(
            r"\b\w+\b",
            old_lower
        )
    )

    content_words = set(
        re.findall(
            r"\b\w+\b",
            content_lower
        )
    )

    if not old_words:

        return {
            "affected": False,
            "confidence": 0.1,
            "reason": "No meaningful old value was supplied.",
            "suggested_fix": ""
        }

    overlap = len(
        old_words.intersection(
            content_words
        )
    )

    score = overlap / max(
        len(old_words),
        1
    )

    if old_lower in content_lower:

        return {
            "affected": True,
            "confidence": 0.88,
            "reason": (
                f'The section explicitly references '
                f'"{old_value}", which has changed.'
            ),
            "suggested_fix": content.replace(
                old_value,
                new_value
            )
        }

    if score >= 0.5:

        return {
            "affected": True,
            "confidence": 0.65,
            "reason": (
                "The section contains several "
                "terms related to the changed value."
            ),
            "suggested_fix": content
        }

    return {
        "affected": False,
        "confidence": 0.1,
        "reason": (
            "No strong dependency on the changed "
            "value was detected."
        ),
        "suggested_fix": ""
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "name": "RIPPLE",
        "message": "AI Knowledge Impact & Change Intelligence Platform",
        "gemini": bool(gemini_client),
        "model": GEMINI_MODEL
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "gemini": bool(gemini_client),
        "model": GEMINI_MODEL
    }


# ============================================================
# UPLOAD
# ============================================================

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...)
):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="Filename is required."
        )

    allowed_extensions = [
        ".pdf",
        ".docx",
        ".txt",
        ".md"
    ]

    extension = Path(
        file.filename
    ).suffix.lower()

    if extension not in allowed_extensions:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. "
                "Use PDF, DOCX, TXT or MD."
            )
        )

    safe_filename = Path(
        file.filename
    ).name

    file_path = UPLOAD_DIR / safe_filename

    with file_path.open("wb") as buffer:

        shutil.copyfileobj(
            file.file,
            buffer
        )

    try:

        sections = extract_document(
            file_path
        )

    except Exception as error:

        file_path.unlink(
            missing_ok=True
        )

        raise HTTPException(
            status_code=400,
            detail=f"Could not read document: {error}"
        )

    db = get_db()

    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO documents
        (filename, file_type)
        VALUES (?, ?)
        """,
        (
            safe_filename,
            file.content_type
        )
    )

    document_id = cursor.lastrowid

    for section in sections:

        cursor.execute(
            """
            INSERT INTO sections
            (
                document_id,
                page_number,
                section_title,
                content
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                document_id,
                section.get(
                    "page_number"
                ),
                section.get(
                    "section_title"
                ),
                section.get(
                    "content"
                )
            )
        )

    db.commit()

    db.close()

    return {
        "message": "Document uploaded and indexed.",
        "document_id": document_id,
        "filename": safe_filename,
        "sections": len(sections)
    }


# ============================================================
# DOCUMENTS
# ============================================================

@app.get("/documents")
def get_documents():

    db = get_db()

    rows = db.execute(
        """
        SELECT
            d.id,
            d.filename,
            d.file_type,
            d.uploaded_at,
            COUNT(s.id) AS section_count
        FROM documents d
        LEFT JOIN sections s
            ON d.id = s.document_id
        GROUP BY d.id
        ORDER BY d.id DESC
        """
    ).fetchall()

    db.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# SINGLE DOCUMENT
# ============================================================

@app.get("/documents/{document_id}")
def get_document(
    document_id: int
):

    db = get_db()

    document = db.execute(
        """
        SELECT *
        FROM documents
        WHERE id = ?
        """,
        (document_id,)
    ).fetchone()

    if not document:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    sections = db.execute(
        """
        SELECT *
        FROM sections
        WHERE document_id = ?
        ORDER BY id
        """,
        (document_id,)
    ).fetchall()

    db.close()

    return {
        "document": dict(document),
        "sections": [
            dict(section)
            for section in sections
        ]
    }


# ============================================================
# ANALYZE CHANGE
# ============================================================

@app.post("/analyze-change")
def analyze_change(
    request: ChangeRequest
):

    if not request.old_value.strip():

        raise HTTPException(
            status_code=400,
            detail="Old value is required."
        )

    if not request.new_value.strip():

        raise HTTPException(
            status_code=400,
            detail="New value is required."
        )

    db = get_db()

    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO changes
        (title, old_value, new_value)
        VALUES (?, ?, ?)
        """,
        (
            request.title,
            request.old_value,
            request.new_value
        )
    )

    change_id = cursor.lastrowid

    sections = cursor.execute(
        """
        SELECT
            s.*,
            d.filename
        FROM sections s
        JOIN documents d
            ON s.document_id = d.id
        ORDER BY s.id
        """
    ).fetchall()

    results = []

    for section in sections:

        ai_result = ai_analyze_change(
            title=request.title,
            old_value=request.old_value,
            new_value=request.new_value,
            section_title=section[
                "section_title"
            ],
            content=section[
                "content"
            ]
        )

        if ai_result:

            result = ai_result

        else:

            result = local_analyze_change(
                old_value=request.old_value,
                new_value=request.new_value,
                content=section[
                    "content"
                ]
            )

        cursor.execute(
            """
            INSERT INTO impacts
            (
                change_id,
                document_id,
                section_id,
                affected,
                confidence,
                reason,
                suggested_fix
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                change_id,
                section["document_id"],
                section["id"],
                int(
                    result["affected"]
                ),
                result["confidence"],
                result["reason"],
                result["suggested_fix"]
            )
        )

        impact_id = cursor.lastrowid

        results.append(
            {
                "id": impact_id,
                "document_id": section[
                    "document_id"
                ],
                "document_name": section[
                    "filename"
                ],
                "section_id": section[
                    "id"
                ],
                "section_title": section[
                    "section_title"
                ],
                "page_number": section[
                    "page_number"
                ],
                "content": section[
                    "content"
                ],
                "affected": result[
                    "affected"
                ],
                "confidence": result[
                    "confidence"
                ],
                "reason": result[
                    "reason"
                ],
                "suggested_fix": result[
                    "suggested_fix"
                ],
                "status": "pending"
            }
        )

    db.commit()

    db.close()

    affected_count = sum(
        1
        for item in results
        if item["affected"]
    )

    return {
        "change_id": change_id,
        "title": request.title,
        "old_value": request.old_value,
        "new_value": request.new_value,
        "ai_engine": (
            "Gemini"
            if gemini_client
            else "Local fallback"
        ),
        "total_sections": len(results),
        "affected_sections": affected_count,
        "results": results
    }


# ============================================================
# IMPACTS FOR CHANGE
# ============================================================

@app.get("/impacts/{change_id}")
def get_impacts(
    change_id: int
):

    db = get_db()

    rows = db.execute(
        """
        SELECT
            i.*,
            d.filename,
            s.section_title,
            s.page_number,
            s.content
        FROM impacts i
        JOIN documents d
            ON i.document_id = d.id
        JOIN sections s
            ON i.section_id = s.id
        WHERE i.change_id = ?
        ORDER BY i.affected DESC,
                 i.confidence DESC
        """,
        (change_id,)
    ).fetchall()

    db.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# APPROVE / REJECT
# ============================================================

@app.patch("/impacts/{impact_id}")
def update_impact(
    impact_id: int,
    decision: ImpactDecision
):

    allowed = [
        "approved",
        "rejected",
        "pending"
    ]

    if decision.status not in allowed:

        raise HTTPException(
            status_code=400,
            detail="Invalid status."
        )

    db = get_db()

    cursor = db.cursor()

    cursor.execute(
        """
        UPDATE impacts
        SET status = ?
        WHERE id = ?
        """,
        (
            decision.status,
            impact_id
        )
    )

    if cursor.rowcount == 0:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="Impact not found."
        )

    db.commit()

    db.close()

    return {
        "message": "Impact status updated.",
        "impact_id": impact_id,
        "status": decision.status
    }


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def dashboard():

    db = get_db()

    documents = db.execute(
        "SELECT COUNT(*) AS count FROM documents"
    ).fetchone()["count"]

    sections = db.execute(
        "SELECT COUNT(*) AS count FROM sections"
    ).fetchone()["count"]

    affected = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM impacts
        WHERE affected = 1
        """
    ).fetchone()["count"]

    pending = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM impacts
        WHERE status = 'pending'
        AND affected = 1
        """
    ).fetchone()["count"]

    approved = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM impacts
        WHERE status = 'approved'
        """
    ).fetchone()["count"]

    rejected = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM impacts
        WHERE status = 'rejected'
        """
    ).fetchone()["count"]

    db.close()

    if sections:

        health = max(
            0,
            round(
                100 -
                (
                    affected /
                    max(sections, 1)
                    * 100
                )
            )
        )

    else:

        health = 100

    return {
        "documents": documents,
        "sections": sections,
        "affected": affected,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "health": health,
        "gemini": bool(gemini_client),
        "model": GEMINI_MODEL
    }


# ============================================================
# RESET
# ============================================================

@app.delete("/reset")
def reset_data():

    db = get_db()

    db.execute(
        "DELETE FROM impacts"
    )

    db.execute(
        "DELETE FROM changes"
    )

    db.execute(
        "DELETE FROM sections"
    )

    db.execute(
        "DELETE FROM documents"
    )

    db.commit()

    db.close()

    for file in UPLOAD_DIR.iterdir():

        if file.is_file():

            file.unlink()

    return {
        "message": "RIPPLE data reset successfully."
    }