from typing import Any

from pydantic import BaseModel, Field


class AnalyzeQueryRequest(BaseModel):
    message: str
    profile: dict[str, Any] = Field(default_factory=dict)


class RagUserChunk(BaseModel):
    page_content: str
    embedding: list[float]
    metadata: dict[str, Any] = Field(default_factory=dict)


class RagAskRequest(BaseModel):
    question: str
    user_chunks: list[RagUserChunk] = Field(default_factory=list)


class RagSource(BaseModel):
    page_content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class RagAskResponse(BaseModel):
    answer: str
    sources: list[RagSource]


class DocumentIngestRequest(BaseModel):
    file_name: str
    content_base64: str


class DocumentChunk(BaseModel):
    content: str
    embedding: list[float]
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentIngestResponse(BaseModel):
    file_name: str
    chunks: list[DocumentChunk]
