import base64

import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from threading import Thread

from app.config import (
    EMBEDDING_MODEL,
    OLLAMA_RAG_CHAT_TIMEOUT_SECONDS,
    QUERY_MODEL,
    RAG_CONTEXT_MAX_CHARS,
    RAG_MODEL,
    RAG_PRELOAD,
    RAG_TOP_K,
)
from app.ollama_client import ollama_chat
from app.prompts import build_analysis_prompt, build_rag_prompt
from app.ollama_client import embed_text
from app.rag import RagIndex, build_pdf_chunks_with_embeddings, search_embedded_chunks
from app.schemas import (
    AnalyzeQueryRequest,
    DocumentChunk,
    DocumentIngestRequest,
    DocumentIngestResponse,
    RagAskRequest,
    RagAskResponse,
    RagSource,
)
from app.utils import extract_json_object

app = FastAPI(title="AutoMatch LLM Service")
rag_index = RagIndex()


@app.on_event("startup")
def startup() -> None:
    if RAG_PRELOAD:
        Thread(target=warm_rag_index, daemon=True).start()


def warm_rag_index() -> None:
    try:
        rag_index.load()
    except Exception as exc:
        rag_index.error = str(exc)


def build_limited_context(chunks: list[dict]) -> str:
    parts = []
    used_chars = 0

    for chunk in chunks:
        text = " ".join(str(chunk.get("page_content", "")).split())
        if not text:
            continue

        remaining = RAG_CONTEXT_MAX_CHARS - used_chars
        if remaining <= 0:
            break

        if len(text) > remaining:
            text = text[:remaining].rstrip()

        parts.append(text)
        used_chars += len(text) + 2

    return "\n\n".join(parts)


def build_ranked_rag_context(base_chunks: list[dict], user_chunks: list[dict]) -> list[dict]:
    if not user_chunks:
        return base_chunks[:RAG_TOP_K]

    user_limit = max(RAG_TOP_K - 2, 1)
    selected = user_chunks[:user_limit]

    for chunk in base_chunks[:2]:
        if len(selected) >= RAG_TOP_K:
            break
        selected.append(chunk)

    return selected[:RAG_TOP_K]


@app.get("/health")
def health() -> dict:
    return {
        "message": "AutoMatch LLM service ativo.",
        "rag_ready": rag_index.ready,
        "rag_error": rag_index.error,
        "rag_documents": len(rag_index.chunks),
        "query_model": QUERY_MODEL,
        "rag_model": RAG_MODEL,
        "embedding_model": EMBEDDING_MODEL,
    }


@app.post("/analyze-query")
def analyze_query(payload: AnalyzeQueryRequest) -> dict:
    prompt = build_analysis_prompt(payload.message, payload.profile)

    try:
        content = ollama_chat(
            model=QUERY_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format="json",
            temperature=0,
        )
        parsed = extract_json_object(content)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao contactar Ollama: {exc}") from exc

    if not isinstance(parsed, dict):
        return {
            "intent": "unknown",
            "exactFilters": {},
            "rangeFilters": {},
            "searchText": payload.message,
            "extraTerms": [],
        }

    return parsed


@app.post("/rag/ask", response_model=RagAskResponse)
def ask_rag(payload: RagAskRequest) -> RagAskResponse:
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Pergunta obrigatoria.")

    relevant_chunks = []

    try:
        question_embedding = np.array(embed_text(payload.question), dtype=np.float32)
        payload_user_chunks = [
            {
                "page_content": chunk.page_content,
                "embedding": chunk.embedding,
                "metadata": chunk.metadata,
            }
            for chunk in payload.user_chunks
        ]
        user_chunks = search_embedded_chunks(
            payload.question,
            question_embedding,
            payload_user_chunks,
            max(RAG_TOP_K, 12),
        )

        try:
            base_chunks = rag_index.search_hybrid(payload.question, question_embedding, RAG_TOP_K)
        except RuntimeError:
            if not user_chunks:
                raise
            base_chunks = []

        relevant_chunks = build_ranked_rag_context(base_chunks, user_chunks)
        context = build_limited_context(relevant_chunks)
        answer = ollama_chat(
            model=RAG_MODEL,
            messages=[{"role": "user", "content": build_rag_prompt(payload.question, context)}],
            temperature=0.2,
            timeout=OLLAMA_RAG_CHAT_TIMEOUT_SECONDS,
            num_predict=600,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except requests.Timeout:
        answer = build_rag_timeout_fallback(payload.question, relevant_chunks)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao contactar Ollama: {exc}") from exc

    return RagAskResponse(
        answer=answer,
        sources=[
            RagSource(
                page_content=chunk["page_content"],
                metadata={
                    **chunk.get("metadata", {}),
                    "score": chunk.get("score"),
                },
            )
            for chunk in relevant_chunks[:3]
        ],
    )


@app.post("/documents/ingest", response_model=DocumentIngestResponse)
def ingest_document(payload: DocumentIngestRequest) -> DocumentIngestResponse:
    if not payload.file_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas ficheiros PDF sao suportados.")

    try:
        content = base64.b64decode(payload.content_base64, validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="PDF base64 invalido.") from exc

    try:
        chunks = build_pdf_chunks_with_embeddings(content, payload.file_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao contactar Ollama: {exc}") from exc

    return DocumentIngestResponse(
        file_name=payload.file_name,
        chunks=[
            DocumentChunk(
                content=chunk["page_content"],
                embedding=chunk["embedding"],
                metadata=chunk.get("metadata", {}),
            )
            for chunk in chunks
        ],
    )


@app.post("/rag/reindex")
def reindex_rag() -> dict:
    try:
        rag_index.rebuild()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao contactar Ollama: {exc}") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "message": "Indice RAG reconstruido.",
        "chunks": len(rag_index.chunks),
    }


def build_rag_timeout_fallback(question: str, chunks: list[dict]) -> str:
    excerpts = []

    for chunk in chunks[:3]:
        text = " ".join(str(chunk.get("page_content", "")).split())
        if text:
            excerpts.append(text[:450])

    if not excerpts:
        return "Encontrei o manual, mas nao consegui gerar uma resposta a tempo."

    return "\n\n".join([
        "O modelo demorou demasiado a gerar a resposta, mas estes excertos foram recuperados do manual por embeddings:",
        *[f"- {excerpt}" for excerpt in excerpts],
    ])
