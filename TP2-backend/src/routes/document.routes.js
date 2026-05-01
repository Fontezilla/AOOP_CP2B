import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { ingestPdfWithLlm } from "../llm/llm-client.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";

const router = express.Router();
const MAX_PDF_BYTES = Number.parseInt(process.env.USER_DOCUMENT_MAX_BYTES || `${10 * 1024 * 1024}`, 10);

function sanitizePdfFileName(value = "") {
    return String(value)
        .replace(/[\\/]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getBase64ByteLength(value = "") {
    const normalized = String(value).replace(/\s/g, "");
    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    return Math.floor((normalized.length * 3) / 4) - padding;
}

function embeddingToPgVector(embedding = []) {
    return `[${embedding.map((value) => Number(value)).filter(Number.isFinite).join(",")}]`;
}

async function ensureConversationOwner(conversationId, userId) {
    const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

    if (error || !data) {
        return false;
    }

    return true;
}

async function deleteConversationDocuments(conversationId, userId) {
    const { data: documents, error: docsError } = await supabaseAdmin
        .from("documents")
        .select("id")
        .eq("user_id", userId)
        .eq("conversation_id", conversationId);

    if (docsError) {
        throw docsError;
    }

    const documentIds = (documents || []).map((document) => document.id);

    if (documentIds.length === 0) {
        return;
    }

    const { error: chunksError } = await supabaseAdmin
        .from("document_chunks")
        .delete()
        .in("document_id", documentIds);

    if (chunksError) {
        throw chunksError;
    }

    const { error: deleteDocsError } = await supabaseAdmin
        .from("documents")
        .delete()
        .in("id", documentIds);

    if (deleteDocsError) {
        throw deleteDocsError;
    }
}

router.get("/current", authenticateUser, async (req, res) => {
    try {
        const conversationId = req.query.conversation_id;

        if (!conversationId) {
            return res.json(null);
        }

        const ownsConversation = await ensureConversationOwner(conversationId, req.user.id);
        if (!ownsConversation) {
            return res.status(404).json({ error: "Conversa nao encontrada." });
        }

        const { data, error } = await supabaseAdmin
            .from("documents")
            .select("id, file_name, created_at")
            .eq("user_id", req.user.id)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.json(data?.[0] ?? null);
    } catch {
        return res.status(500).json({ error: "Erro ao obter documento." });
    }
});

router.post("/upload", authenticateUser, async (req, res) => {
    try {
        const fileName = sanitizePdfFileName(req.body?.fileName);
        const contentBase64 = String(req.body?.contentBase64 || "");
        const conversationId = req.body?.conversationId;

        if (!conversationId) {
            return res.status(400).json({ error: "Conversa obrigatoria para associar o PDF." });
        }

        const ownsConversation = await ensureConversationOwner(conversationId, req.user.id);
        if (!ownsConversation) {
            return res.status(404).json({ error: "Conversa nao encontrada." });
        }

        if (!fileName || !fileName.toLowerCase().endsWith(".pdf")) {
            return res.status(400).json({ error: "Envia um ficheiro PDF valido." });
        }

        if (!contentBase64) {
            return res.status(400).json({ error: "Conteudo do PDF em falta." });
        }

        if (getBase64ByteLength(contentBase64) > MAX_PDF_BYTES) {
            return res.status(413).json({ error: "O PDF excede o tamanho maximo permitido." });
        }

        const parsed = await ingestPdfWithLlm(fileName, contentBase64);
        const chunks = Array.isArray(parsed?.chunks) ? parsed.chunks : [];

        if (chunks.length === 0) {
            return res.status(400).json({ error: "O PDF nao produziu texto pesquisavel." });
        }

        await deleteConversationDocuments(conversationId, req.user.id);

        const { data: document, error: documentError } = await supabaseAdmin
            .from("documents")
            .insert({
                user_id: req.user.id,
                conversation_id: conversationId,
                file_name: fileName,
            })
            .select("id, file_name, created_at")
            .single();

        if (documentError) {
            return res.status(400).json({ error: documentError.message });
        }

        const rows = chunks.map((chunk) => ({
            document_id: document.id,
            content: chunk.content,
            embedding: embeddingToPgVector(chunk.embedding),
        }));

        const { error: chunksError } = await supabaseAdmin
            .from("document_chunks")
            .insert(rows);

        if (chunksError) {
            await supabaseAdmin.from("documents").delete().eq("id", document.id);
            return res.status(400).json({ error: chunksError.message });
        }

        return res.status(201).json({
            document,
            chunks: rows.length,
        });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ error: `Erro ao processar PDF: ${detail}` });
    }
});

router.delete("/current", authenticateUser, async (req, res) => {
    try {
        const conversationId = req.body?.conversationId || req.query.conversation_id;

        if (!conversationId) {
            return res.status(400).json({ error: "Conversa obrigatoria." });
        }

        await deleteConversationDocuments(conversationId, req.user.id);
        return res.status(204).send();
    } catch {
        return res.status(500).json({ error: "Erro ao remover documento." });
    }
});

export default router;
