import json
import re
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
from pypdf import PdfReader

from app.config import (
    EMBEDDING_MODEL,
    RAG_CACHE_DIR,
    RAG_CHUNK_OVERLAP,
    RAG_CHUNK_SIZE,
    RAG_MAX_CHUNKS,
    RAG_MAX_CHUNKS_PER_DOCUMENT,
    RAG_DOCUMENTS_DIR,
    RAG_PDF_PATH,
)
from app.ollama_client import embed_text, embed_texts
from app.utils import cosine_similarity, normalize_whitespace


class RagIndex:
    def __init__(self) -> None:
        self.chunks: list[dict[str, Any]] = []
        self.embeddings: np.ndarray | None = None
        self.ready = False
        self.error: str | None = None
        self._lock = Lock()

    def load(self, *, force_rebuild: bool = False) -> None:
        self.ready = False
        self.error = None

        pdf_paths = discover_rag_pdf_paths()
        if not pdf_paths:
            raise FileNotFoundError(f"Nenhum PDF RAG encontrado em {RAG_DOCUMENTS_DIR}")

        if not force_rebuild and self._load_from_cache():
            self.ready = True
            return

        chunks = []
        for path in pdf_paths:
            text_pages = read_pdf_pages(path)
            chunks.extend(
                split_pages(
                    text_pages,
                    RAG_CHUNK_SIZE,
                    RAG_CHUNK_OVERLAP,
                )[:RAG_MAX_CHUNKS_PER_DOCUMENT],
            )

        chunks = chunks[:RAG_MAX_CHUNKS * max(len(pdf_paths), 1)]

        if not chunks:
            raise RuntimeError("Os PDFs RAG nao produziram chunks.")

        vectors = embed_texts([chunk["page_content"] for chunk in chunks])

        self.chunks = chunks
        self.embeddings = np.array(vectors, dtype=np.float32)
        self.ready = True
        self._save_to_cache()

    def ensure_loaded(self) -> None:
        if self.ready:
            return

        with self._lock:
            if self.ready:
                return

            try:
                self.load()
            except Exception as exc:
                self.error = str(exc)
                raise

    def rebuild(self) -> None:
        with self._lock:
            self.load(force_rebuild=True)

    def search(self, question: str, top_k: int) -> list[dict[str, Any]]:
        self.ensure_loaded()

        if not self.ready or self.embeddings is None:
            detail = f" {self.error}" if self.error else ""
            raise RuntimeError(f"RAG nao inicializado.{detail}")

        query_embedding = np.array(embed_text(question), dtype=np.float32)
        return self.search_hybrid(question, query_embedding, top_k)

    def search_hybrid(self, question: str, query_embedding: np.ndarray, top_k: int) -> list[dict[str, Any]]:
        embedding_chunks = self.search_by_embedding(query_embedding, top_k)
        lexical_chunks = search_chunks_by_text(question, self.chunks, top_k)
        return merge_ranked_chunks([*embedding_chunks, *lexical_chunks], top_k)

    def search_by_embedding(self, query_embedding: np.ndarray, top_k: int) -> list[dict[str, Any]]:
        self.ensure_loaded()

        if not self.ready or self.embeddings is None:
            detail = f" {self.error}" if self.error else ""
            raise RuntimeError(f"RAG nao inicializado.{detail}")

        scores = cosine_similarity(self.embeddings, query_embedding)
        best_indexes = np.argsort(scores)[::-1][:top_k]

        return [
            {
                **self.chunks[int(index)],
                "score": float(scores[int(index)]),
            }
            for index in best_indexes
        ]

    def _cache_metadata(self) -> dict[str, Any]:
        pdf_paths = discover_rag_pdf_paths()
        documents = []

        for path in pdf_paths:
            stat = path.stat()
            documents.append({
                "path": str(path.resolve()),
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            })

        return {
            "documents": documents,
            "embedding_model": EMBEDDING_MODEL,
            "chunk_size": RAG_CHUNK_SIZE,
            "chunk_overlap": RAG_CHUNK_OVERLAP,
            "max_chunks": RAG_MAX_CHUNKS,
            "max_chunks_per_document": RAG_MAX_CHUNKS_PER_DOCUMENT,
        }

    def _load_from_cache(self) -> bool:
        metadata_path = get_cache_metadata_path()
        vectors_path = get_cache_vectors_path()

        if not metadata_path.exists() or not vectors_path.exists():
            return False

        try:
            cached = json.loads(metadata_path.read_text(encoding="utf-8"))
            if cached.get("metadata") != self._cache_metadata():
                return False

            data = np.load(vectors_path, allow_pickle=False)
            chunks = json.loads(str(data["chunks_json"].item()))
            embeddings = data["embeddings"].astype(np.float32)
        except Exception:
            return False

        if not isinstance(chunks, list) or embeddings.shape[0] != len(chunks):
            return False

        self.chunks = chunks
        self.embeddings = embeddings
        return True

    def _save_to_cache(self) -> None:
        if self.embeddings is None:
            return

        RAG_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        get_cache_metadata_path().write_text(
            json.dumps({"metadata": self._cache_metadata()}, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        np.savez_compressed(
            get_cache_vectors_path(),
            embeddings=self.embeddings,
            chunks_json=json.dumps(self.chunks, ensure_ascii=True),
        )


def get_cache_metadata_path() -> Path:
    return RAG_CACHE_DIR / "documents.metadata.json"


def get_cache_vectors_path() -> Path:
    return RAG_CACHE_DIR / "documents.embeddings.npz"


def discover_rag_pdf_paths() -> list[Path]:
    paths = []

    if RAG_DOCUMENTS_DIR.exists():
        paths.extend(path for path in RAG_DOCUMENTS_DIR.glob("*.pdf") if path.is_file())

    if not paths and RAG_PDF_PATH.exists():
        paths.append(RAG_PDF_PATH)

    return sorted(set(paths), key=lambda path: str(path).lower())


def read_pdf_pages(path: Path) -> list[dict[str, Any]]:
    reader = PdfReader(str(path))
    return extract_pdf_pages(reader, str(path))


def read_pdf_bytes(content: bytes, source: str) -> list[dict[str, Any]]:
    reader = PdfReader(BytesIO(content))
    return extract_pdf_pages(reader, source)


def extract_pdf_pages(reader: PdfReader, source: str) -> list[dict[str, Any]]:
    pages = []

    for index, page in enumerate(reader.pages):
        text = normalize_whitespace(page.extract_text() or "")

        if text:
            pages.append({
                "page_content": text,
                "metadata": {"source": source, "page": index + 1},
            })

    return pages


def split_pages(pages: list[dict[str, Any]], chunk_size: int, overlap: int) -> list[dict[str, Any]]:
    chunks = []
    step = max(chunk_size - overlap, 1)

    for page in pages:
        content = page["page_content"]

        for start in range(0, len(content), step):
            chunk_text = content[start:start + chunk_size].strip()

            if not chunk_text:
                continue

            chunks.append({
                "page_content": chunk_text,
                "metadata": page["metadata"],
            })

            if start + chunk_size >= len(content):
                break

    return chunks


def normalize_search_text(value: str) -> str:
    return re.sub(r"[^a-z0-9\s]+", " ", str(value).lower())


def expand_query_terms(question: str) -> list[str]:
    normalized = normalize_search_text(question)
    stopwords = {
        "que", "qual", "quais", "como", "onde", "quando", "porque", "por",
        "para", "com", "uma", "uns", "das", "dos", "nas", "nos", "este",
        "esta", "isto", "isso", "sobre", "documento",
    }
    terms = [
        term for term in normalized.split()
        if len(term) >= 3 and term not in stopwords
    ]
    extra_terms = []

    synonyms = {
        "pneus": ["tire", "tires", "tyres"],
        "pneu": ["tire", "tires", "tyres"],
        "pressao": ["pressure", "inflation"],
        "pressão": ["pressure", "inflation"],
        "recomendada": ["recommended", "specified", "specifications"],
        "diferencas": ["differences", "technical data", "engine data"],
        "diferenças": ["differences", "technical data", "engine data"],
        "manual": ["owner", "owners"],
    }

    for term in terms:
        if term.endswith("ai") and len(term) > 4:
            extra_terms.append(term[:-2])
        extra_terms.extend(synonyms.get(term, []))

    return list(dict.fromkeys([*terms, *extra_terms]))


def lexical_score(question: str, content: str) -> float:
    terms = expand_query_terms(question)
    normalized_content = normalize_search_text(content)

    if not terms or not normalized_content:
        return 0

    score = 0.0
    for term in terms:
        normalized_term = normalize_search_text(term).strip()
        if not normalized_term:
            continue

        if normalized_term in normalized_content:
            score += 1.0 + min(normalized_content.count(normalized_term), 4) * 0.15

    if "tire" in normalized_content and "pressure" in normalized_content:
        score += 2.0

    if "inflation pressure" in normalized_content:
        score += 2.0

    return score


def chunk_identity(chunk: dict[str, Any]) -> tuple:
    metadata = chunk.get("metadata", {})
    return (
        metadata.get("source"),
        metadata.get("page"),
        chunk.get("page_content", "")[:80],
    )


def search_chunks_by_text(question: str, chunks: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    scored = []

    for chunk in chunks:
        score = lexical_score(question, chunk.get("page_content", ""))
        if score > 0:
            scored.append({
                **chunk,
                "score": score,
                "score_type": "lexical",
            })

    scored.sort(key=lambda chunk: float(chunk.get("score") or 0), reverse=True)
    return scored[:top_k]


def merge_ranked_chunks(chunks: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    merged = {}

    for chunk in chunks:
        key = chunk_identity(chunk)
        score = float(chunk.get("score") or 0)

        if key not in merged or score > float(merged[key].get("score") or 0):
            merged[key] = chunk

    return sorted(
        merged.values(),
        key=lambda chunk: float(chunk.get("score") or 0),
        reverse=True,
    )[:top_k]


def build_pdf_chunks_with_embeddings(content: bytes, source: str) -> list[dict[str, Any]]:
    pages = read_pdf_bytes(content, source)
    chunks = split_pages(pages, RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP)[:RAG_MAX_CHUNKS_PER_DOCUMENT]

    if not chunks:
        raise RuntimeError("O PDF enviado nao produziu texto pesquisavel.")

    vectors = embed_texts([chunk["page_content"] for chunk in chunks])

    return [
        {
            **chunk,
            "embedding": [float(value) for value in vector],
        }
        for chunk, vector in zip(chunks, vectors)
    ]


def search_embedded_chunks(
    question: str,
    question_embedding: np.ndarray,
    chunks: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    valid_chunks = [
        chunk for chunk in chunks
        if isinstance(chunk.get("embedding"), list) and chunk.get("page_content")
    ]

    if not valid_chunks:
        return search_chunks_by_text(question, chunks, top_k)

    embeddings = np.array([chunk["embedding"] for chunk in valid_chunks], dtype=np.float32)
    scores = cosine_similarity(embeddings, question_embedding)
    best_indexes = np.argsort(scores)[::-1][:top_k]

    embedding_results = [
        {
            "page_content": valid_chunks[int(index)]["page_content"],
            "metadata": valid_chunks[int(index)].get("metadata", {}),
            "score": float(scores[int(index)]),
            "score_type": "embedding",
        }
        for index in best_indexes
    ]
    lexical_results = search_chunks_by_text(question, valid_chunks, top_k)

    return merge_ranked_chunks([*lexical_results, *embedding_results], top_k)
