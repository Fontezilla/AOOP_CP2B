import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOCUMENTS_DIR = PROJECT_ROOT / "TP2-backend" / "src" / "rag" / "documents"
DEFAULT_PDF_PATH = DEFAULT_DOCUMENTS_DIR / "manual.pdf"

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
QUERY_MODEL = os.getenv("OLLAMA_QUERY_MODEL", "mistral")
RAG_MODEL = os.getenv("OLLAMA_RAG_MODEL", "mistral")
EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")
RAG_PDF_PATH = Path(os.getenv("RAG_PDF_PATH", str(DEFAULT_PDF_PATH)))
RAG_DOCUMENTS_DIR = Path(os.getenv("RAG_DOCUMENTS_DIR", str(DEFAULT_DOCUMENTS_DIR)))
RAG_CACHE_DIR = Path(os.getenv("RAG_CACHE_DIR", str(PROJECT_ROOT / "TP2-llm-service" / ".rag-cache")))
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "700"))
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "100"))
RAG_MAX_CHUNKS = int(os.getenv("RAG_MAX_CHUNKS", "800"))
RAG_MAX_CHUNKS_PER_DOCUMENT = int(os.getenv("RAG_MAX_CHUNKS_PER_DOCUMENT", str(RAG_MAX_CHUNKS)))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "8"))
RAG_CONTEXT_MAX_CHARS = int(os.getenv("RAG_CONTEXT_MAX_CHARS", "8000"))
RAG_PRELOAD = os.getenv("RAG_PRELOAD", "true").lower() == "true"
OLLAMA_CHAT_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_CHAT_TIMEOUT_SECONDS", "30"))
OLLAMA_RAG_CHAT_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_RAG_CHAT_TIMEOUT_SECONDS", "300"))
OLLAMA_EMBEDDING_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_EMBEDDING_TIMEOUT_SECONDS", "120"))
