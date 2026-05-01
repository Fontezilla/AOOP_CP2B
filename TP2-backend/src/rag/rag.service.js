import { supabaseAdmin } from "../config/supabase.js";
import { askRagWithLlm, askRagWithUserChunks, checkLlmHealth } from "../llm/llm-client.js";

export async function initRAG() {
    return checkLlmHealth();
}

export async function askRAG(question) {
    return askRagWithLlm(question);
}

function parseEmbedding(value) {
    if (Array.isArray(value)) {
        return value.map(Number).filter(Number.isFinite);
    }

    if (typeof value !== "string") {
        return [];
    }

    return value
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split(",")
        .map((item) => Number.parseFloat(item.trim()))
        .filter(Number.isFinite);
}

export async function getConversationRagChunks(userId, conversationId) {
    if (!userId || !conversationId) {
        return [];
    }

    const { data: documents, error: docsError } = await supabaseAdmin
        .from("documents")
        .select("id, file_name")
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (docsError || !Array.isArray(documents) || documents.length === 0) {
        return [];
    }

    const document = documents[0];
    const { data: chunks, error: chunksError } = await supabaseAdmin
        .from("document_chunks")
        .select("content, embedding")
        .eq("document_id", document.id);

    if (chunksError || !Array.isArray(chunks)) {
        return [];
    }

    return chunks
        .map((chunk, index) => ({
            page_content: chunk.content,
            embedding: parseEmbedding(chunk.embedding),
            metadata: {
                source: document.file_name,
                document_id: document.id,
                user_document: true,
                chunk: index + 1,
            },
        }))
        .filter((chunk) => chunk.page_content && chunk.embedding.length > 0);
}

export async function askRAGForConversation(question, userId, conversationId) {
    const userChunks = await getConversationRagChunks(userId, conversationId);
    return askRagWithUserChunks(question, userChunks);
}
