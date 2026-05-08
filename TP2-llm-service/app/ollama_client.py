from typing import Any
from functools import lru_cache
import requests
from app.config import (
    EMBEDDING_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_RAG_BASE_URL,
    OLLAMA_CHAT_TIMEOUT_SECONDS,
    OLLAMA_RAG_CHAT_TIMEOUT_SECONDS,
    OLLAMA_EMBEDDING_TIMEOUT_SECONDS,
)

SESSION = requests.Session()
RAG_SESSION = requests.Session()


def ollama_chat(
    *,
    model: str,
    messages: list[dict[str, str]],
    response_format: str | None = None,
    temperature: float = 0,
    timeout: int = OLLAMA_CHAT_TIMEOUT_SECONDS,
    num_predict: int | None = None,
    base_url: str = OLLAMA_BASE_URL,
) -> str:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    
    if num_predict is not None:
        payload["options"]["num_predict"] = num_predict
        
    if response_format:
        payload["format"] = response_format

    session = RAG_SESSION if base_url == OLLAMA_RAG_BASE_URL else SESSION
    response = session.post(
        f"{base_url}/api/chat",
        json=payload,
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()
    
    return str(data.get("message", {}).get("content", ""))


def ollama_chat_rag(
    *,
    model: str,
    messages: list[dict[str, str]],
    response_format: str | None = None,
    temperature: float = 0,
    timeout: int = OLLAMA_RAG_CHAT_TIMEOUT_SECONDS,
    num_predict: int | None = None,
) -> str:
    """Chamada ao Ollama RAG — usa OLLAMA_RAG_BASE_URL (pode ser remoto via ngrok)."""
    return ollama_chat(
        model=model,
        messages=messages,
        response_format=response_format,
        temperature=temperature,
        timeout=timeout,
        num_predict=num_predict,
        base_url=OLLAMA_RAG_BASE_URL,
    )


@lru_cache(maxsize=512)
def embed_text(text: str) -> list[float]:
    return embed_texts((text,))[0]


def embed_texts(texts: tuple[str, ...] | list[str]) -> list[list[float]]:
    values = tuple(str(text) for text in texts)
    
    if not values:
        return []
    
    try:
        return embed_texts_batch(values)
    except requests.RequestException:
        if len(values) == 1:
            raise
        
        return [embed_text_single(value) for value in values]


def embed_texts_batch(texts: tuple[str, ...]) -> list[list[float]]:
    response = SESSION.post(
        f"{OLLAMA_BASE_URL}/api/embed",
        json={"model": EMBEDDING_MODEL, "input": list(texts)},
        timeout=OLLAMA_EMBEDDING_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    embeddings = data.get("embeddings")
    
    if not isinstance(embeddings, list) or len(embeddings) != len(texts):
        raise RuntimeError("Resposta de embeddings em batch invalida.")
    
    return [[float(value) for value in embedding] for embedding in embeddings]


def embed_text_single(text: str) -> list[float]:
    response = SESSION.post(
        f"{OLLAMA_BASE_URL}/api/embeddings",
        json={"model": EMBEDDING_MODEL, "prompt": str(text)},
        timeout=OLLAMA_EMBEDDING_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    embedding = data.get("embedding")
    
    if not isinstance(embedding, list):
        raise RuntimeError("Resposta de embeddings invalida.")
    
    return [float(value) for value in embedding]