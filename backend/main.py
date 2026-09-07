from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

import sqlite3
import shutil
import uuid
import json
import re
import os
import requests
import fitz

from docx import Document as DocxDocument


# ============================================================
# CONFIGURATION
# ============================================================

load_dotenv()

app = FastAPI(
    title="RIPPLE API",
    description="Knowledge Impact & Change Intelligence Platform",
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

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATABASE = BASE_DIR / "ripple.db"

UPLOAD_DIR.mkdir(exist_ok=True)


# ============================================================
# DATABASE
# ============================================================

def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    db = get_db()

    db.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            file_type TEXT,
            file_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS sections (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            page_number INTEGER,
            section_title TEXT,
            paragraph_number INTEGER,
            content TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id)
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS changes (
            id TEXT PRIMARY KEY,
            title TEXT,
            old_value TEXT,
            new_value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS impacts (
            id TEXT PRIMARY KEY,
            change_id TEXT NOT NULL,
            section_id TEXT NOT NULL,
            confidence REAL,
            reason TEXT,
            suggested_fix TEXT,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY(change_id) REFERENCES changes(id),
            FOREIGN KEY(section_id) REFERENCES sections(id)
        )
    """)

    db.commit()
    db.close()


initialize_database()


# ============================================================
# MODELS
# ============================================================

class ChangeRequest(BaseModel):
    title: str
    old_value: str
    new_value: str


class ReviewRequest(BaseModel):
    status: str


# ============================================================
# HEALTH
# ============================================================

@app.get("/")
def root():
    return {
        "name": "RIPPLE",
        "message": "Knowledge Impact & Change Intelligence Platform",
        "status": "online"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# ============================================================
# TEXT EXTRACTION
# ============================================================

def clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_into_paragraphs(text: str):
    blocks = re.split(r"\n\s*\n", text)

    paragraphs = []

    for block in blocks:
        block = clean_text(block)

        if block:
            paragraphs.append(block)

    if not paragraphs and text.strip():
        paragraphs = [clean_text(text)]

    return paragraphs


def extract_pdf(file_path: Path):
    pages = []

    pdf = fitz.open(file_path)

    for page_number, page in enumerate(pdf, start=1):

        text = page.get_text("text")

        text = clean_text(text)

        paragraphs = split_into_paragraphs(text)

        for paragraph_number, paragraph in enumerate(
            paragraphs,
            start=1
        ):
            pages.append({
                "page_number": page_number,
                "paragraph_number": paragraph_number,
                "section_title": detect_section_title(paragraph),
                "content": paragraph
            })

    pdf.close()

    return pages


def extract_docx(file_path: Path):
    document = DocxDocument(file_path)

    sections = []

    paragraph_number = 0

    for paragraph in document.paragraphs:

        text = clean_text(paragraph.text)

        if not text:
            continue

        paragraph_number += 1

        sections.append({
            "page_number": 1,
            "paragraph_number": paragraph_number,
            "section_title": detect_section_title(text),
            "content": text
        })

    return sections


def detect_section_title(text: str):
    words = text.split()

    if len(words) <= 12 and (
        text.isupper()
        or text.endswith(":")
        or text.lower().startswith((
            "section ",
            "chapter ",
            "article ",
            "policy ",
            "guidelines "
        ))
    ):
        return text[:200]

    return None


def extract_document(file_path: Path):
    suffix = file_path.suffix.lower()

    if suffix == ".pdf":
        return extract_pdf(file_path)

    if suffix == ".docx":
        return extract_docx(file_path)

    if suffix in [".txt", ".md"]:
        text = clean_text(
            file_path.read_text(
                encoding="utf-8",
                errors="ignore"
            )
        )

        paragraphs = split_into_paragraphs(text)

        return [
            {
                "page_number": 1,
                "paragraph_number": index,
                "section_title": detect_section_title(paragraph),
                "content": paragraph
            }
            for index, paragraph in enumerate(
                paragraphs,
                start=1
            )
        ]

    raise HTTPException(
        status_code=400,
        detail="Supported formats: PDF, DOCX, TXT, MD"
    )


# ============================================================
# UPLOAD
# ============================================================

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):

    allowed_extensions = [
        ".pdf",
        ".docx",
        ".txt",
        ".md"
    ]

    extension = Path(file.filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, TXT and MD files are supported."
        )

    document_id = str(uuid.uuid4())

    safe_filename = (
        document_id +
        "_" +
        Path(file.filename).name
    )

    file_path = UPLOAD_DIR / safe_filename

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    try:
        sections = extract_document(file_path)

    except Exception as error:
        file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail=f"Document extraction failed: {error}"
        )

    db = get_db()

    db.execute(
        """
        INSERT INTO documents
        (id, filename, file_type, file_path)
        VALUES (?, ?, ?, ?)
        """,
        (
            document_id,
            file.filename,
            file.content_type,
            str(file_path)
        )
    )

    for section in sections:

        db.execute(
            """
            INSERT INTO sections
            (
                id,
                document_id,
                page_number,
                section_title,
                paragraph_number,
                content
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                document_id,
                section["page_number"],
                section["section_title"],
                section["paragraph_number"],
                section["content"]
            )
        )

    db.commit()
    db.close()

    return {
        "success": True,
        "document_id": document_id,
        "filename": file.filename,
        "sections": len(sections)
    }


# ============================================================
# DOCUMENTS
# ============================================================

@app.get("/documents")
def get_documents():

    db = get_db()

    documents = db.execute(
        """
        SELECT
            d.id,
            d.filename,
            d.file_type,
            d.created_at,
            COUNT(s.id) AS sections
        FROM documents d
        LEFT JOIN sections s
        ON d.id = s.document_id
        GROUP BY d.id
        ORDER BY d.created_at DESC
        """
    ).fetchall()

    db.close()

    return [
        dict(document)
        for document in documents
    ]


@app.get("/documents/{document_id}")
def get_document(document_id: str):

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
            detail="Document not found"
        )

    sections = db.execute(
        """
        SELECT *
        FROM sections
        WHERE document_id = ?
        ORDER BY page_number, paragraph_number
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
# SIMPLE AI / SEMANTIC IMPACT ENGINE
# ============================================================

STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "must",
    "shall",
    "will",
    "are",
    "was",
    "were",
    "has",
    "have",
    "been",
    "being",
    "students",
    "student",
    "their",
    "they",
    "you",
    "your",
    "about",
    "after",
    "before",
    "than",
    "then",
    "only",
    "also"
}


def tokenize(text: str):

    words = re.findall(
        r"[a-zA-Z0-9]+",
        text.lower()
    )

    return {
        word
        for word in words
        if len(word) > 2
        and word not in STOP_WORDS
    }


def calculate_similarity(change_text, section_text):

    change_words = tokenize(change_text)
    section_words = tokenize(section_text)

    if not change_words or not section_words:
        return 0

    overlap = change_words.intersection(
        section_words
    )

    score = len(overlap) / len(change_words)

    return min(score, 1.0)


def explain_impact(
    old_value,
    new_value,
    content
):

    old_words = tokenize(old_value)

    matched = []

    lower_content = content.lower()

    for word in old_words:

        if word in lower_content:
            matched.append(word)

    if matched:

        return (
            "This section appears to depend on the "
            "previous rule because it references "
            "related terminology such as: "
            + ", ".join(matched[:6])
            + ". The new rule may make this information "
              "outdated and should be reviewed."
        )

    return (
        "This section contains concepts related to "
        "the requested change. RIPPLE recommends "
        "human review to determine whether the "
        "information remains valid."
    )


def generate_fix(
    old_value,
    new_value,
    content
):

    if old_value.lower() in content.lower():

        return re.sub(
            re.escape(old_value),
            new_value,
            content,
            flags=re.IGNORECASE
        )

    return (
        content
        + "\n\n"
        + "[Suggested update: "
        + new_value
        + "]"
    )


# ============================================================
# OPTIONAL LLM
# ============================================================

def call_external_ai(prompt: str) -> Optional[str]:

    api_key = os.getenv("AI_API_KEY")
    api_url = os.getenv("AI_API_URL")
    model = os.getenv("AI_MODEL")

    if not api_key or not api_url:
        return None

    try:

        response = requests.post(
            api_url,
            headers={
                "Authorization":
                    f"Bearer {api_key}",
                "Content-Type":
                    "application/json"
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.2
            },
            timeout=60
        )

        response.raise_for_status()

        data = response.json()

        return (
            data
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content")
        )

    except Exception:
        return None


# ============================================================
# CREATE CHANGE + ANALYZE IMPACT
# ============================================================

@app.post("/analyze-change")
def analyze_change(request: ChangeRequest):

    change_id = str(uuid.uuid4())

    db = get_db()

    db.execute(
        """
        INSERT INTO changes
        (id, title, old_value, new_value)
        VALUES (?, ?, ?, ?)
        """,
        (
            change_id,
            request.title,
            request.old_value,
            request.new_value
        )
    )

    sections = db.execute(
        """
        SELECT
            s.*,
            d.filename
        FROM sections s
        JOIN documents d
        ON s.document_id = d.id
        """
    ).fetchall()

    impacts = []

    change_text = (
        request.title
        + " "
        + request.old_value
        + " "
        + request.new_value
    )

    for section in sections:

        similarity = calculate_similarity(
            change_text,
            section["content"]
        )

        old_match = (
            request.old_value.lower()
            in section["content"].lower()
        )

        if old_match:
            confidence = 0.95

        elif similarity >= 0.30:
            confidence = min(
                0.70 + similarity * 0.5,
                0.92
            )

        elif similarity >= 0.15:
            confidence = 0.55

        else:
            confidence = 0

        if confidence >= 0.55:

            reason = explain_impact(
                request.old_value,
                request.new_value,
                section["content"]
            )

            suggested_fix = generate_fix(
                request.old_value,
                request.new_value,
                section["content"]
            )

            impact_id = str(uuid.uuid4())

            db.execute(
                """
                INSERT INTO impacts
                (
                    id,
                    change_id,
                    section_id,
                    confidence,
                    reason,
                    suggested_fix
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    impact_id,
                    change_id,
                    section["id"],
                    confidence,
                    reason,
                    suggested_fix
                )
            )

            impacts.append({
                "impact_id": impact_id,
                "section_id": section["id"],
                "document_id": section["document_id"],
                "filename": section["filename"],
                "page_number": section["page_number"],
                "paragraph_number":
                    section["paragraph_number"],
                "section_title":
                    section["section_title"],
                "content": section["content"],
                "confidence": round(
                    confidence * 100
                ),
                "reason": reason,
                "suggested_fix": suggested_fix,
                "status": "pending"
            })

    db.commit()
    db.close()

    impacts.sort(
        key=lambda item:
            item["confidence"],
        reverse=True
    )

    return {
        "change_id": change_id,
        "change": {
            "title": request.title,
            "old_value": request.old_value,
            "new_value": request.new_value
        },
        "total_affected": len(impacts),
        "impacts": impacts
    }


# ============================================================
# IMPACT RESULTS
# ============================================================

@app.get("/impacts/{change_id}")
def get_impacts(change_id: str):

    db = get_db()

    results = db.execute(
        """
        SELECT
            i.*,
            s.document_id,
            s.page_number,
            s.paragraph_number,
            s.section_title,
            s.content,
            d.filename
        FROM impacts i
        JOIN sections s
        ON i.section_id = s.id
        JOIN documents d
        ON s.document_id = d.id
        WHERE i.change_id = ?
        ORDER BY i.confidence DESC
        """,
        (change_id,)
    ).fetchall()

    db.close()

    return [
        dict(result)
        for result in results
    ]


# ============================================================
# APPROVE / REJECT
# ============================================================

@app.patch("/impacts/{impact_id}")
def review_impact(
    impact_id: str,
    request: ReviewRequest
):

    if request.status not in [
        "approved",
        "rejected",
        "pending"
    ]:
        raise HTTPException(
            status_code=400,
            detail="Invalid review status"
        )

    db = get_db()

    cursor = db.execute(
        """
        UPDATE impacts
        SET status = ?
        WHERE id = ?
        """,
        (
            request.status,
            impact_id
        )
    )

    db.commit()

    if cursor.rowcount == 0:
        db.close()

        raise HTTPException(
            status_code=404,
            detail="Impact not found"
        )

    db.close()

    return {
        "success": True,
        "impact_id": impact_id,
        "status": request.status
    }


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def dashboard():

    db = get_db()

    document_count = db.execute(
        "SELECT COUNT(*) FROM documents"
    ).fetchone()[0]

    change_count = db.execute(
        "SELECT COUNT(*) FROM changes"
    ).fetchone()[0]

    conflict_count = db.execute(
        """
        SELECT COUNT(*)
        FROM impacts
        WHERE confidence >= 0.85
        AND status = 'pending'
        """
    ).fetchone()[0]

    review_count = db.execute(
        """
        SELECT COUNT(*)
        FROM impacts
        WHERE status = 'pending'
        """
    ).fetchone()[0]

    db.close()

    health = max(
        50,
        100 - conflict_count * 3
    )

    return {
        "knowledge_sources": document_count,
        "detected_changes": change_count,
        "potential_conflicts": conflict_count,
        "pending_reviews": review_count,
        "knowledge_health": health
    }


# ============================================================
# DELETE EVERYTHING
# ============================================================

@app.delete("/reset")
def reset_database():

    db = get_db()

    db.execute("DELETE FROM impacts")
    db.execute("DELETE FROM changes")
    db.execute("DELETE FROM sections")
    db.execute("DELETE FROM documents")

    db.commit()
    db.close()

    for file in UPLOAD_DIR.iterdir():

        if file.is_file():
            file.unlink()

    return {
        "success": True,
        "message": "RIPPLE knowledge base reset"
    }