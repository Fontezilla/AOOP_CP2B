import dotenv from "dotenv";
dotenv.config();

function getLlmServiceUrl() {
    return process.env.LLM_SERVICE_URL || "http://localhost:8000";
}

function getEnvInt(name, fallback) {
    const value = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getLlmServiceTimeoutMs(path) {
    if (path.startsWith("/documents/")) {
        return getEnvInt("LLM_DOCUMENT_TIMEOUT_MS", 600000);
    }

    if (path.startsWith("/rag/")) {
        return getEnvInt("LLM_RAG_TIMEOUT_MS", 360000);
    }

    return getEnvInt("LLM_ANALYZE_TIMEOUT_MS", getEnvInt("LLM_SERVICE_TIMEOUT_MS", 8000));
}

async function postToLlmService(path, payload) {
    const controller = new AbortController();
    const timeoutMs = getLlmServiceTimeoutMs(path);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;

    try {
        response = await fetch(`${getLlmServiceUrl()}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`LLM service timeout after ${Math.round(timeoutMs / 1000)}s on ${path}`);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        let detail = response.statusText;

        try {
            const data = await response.json();
            detail = data.detail || data.error || detail;
        } catch {
        }

        throw new Error(`LLM service error (${response.status}): ${detail}`);
    }

    return response.json();
}

export async function analyzeQueryWithLlm(message, profile) {
    return postToLlmService("/analyze-query", {
        message,
        profile,
    });
}

export async function askRagWithLlm(question) {
    return postToLlmService("/rag/ask", {
        question,
        user_chunks: [],
        history: [],
    });
}

export async function askRagWithUserChunks(question, userChunks = [], history = []) {
    return postToLlmService("/rag/ask", {
        question,
        user_chunks: userChunks,
        history,
    });
}

export async function ingestPdfWithLlm(fileName, contentBase64) {
    return postToLlmService("/documents/ingest", {
        file_name: fileName,
        content_base64: contentBase64,
    });
}

export async function checkLlmHealth() {
    const response = await fetch(`${getLlmServiceUrl()}/health`);

    if (!response.ok) {
        throw new Error(`LLM service healthcheck failed (${response.status})`);
    }
    
    return response.json();
}