import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { askRAGForConversation } from "../rag/rag.service.js";
import {
    analyzeUserQuery,
    applyCarFilters,
    buildCarsReply,
    finalizeCarSearchResults,
    getCarsSearchProfile,
    isCarSearchIntent,
} from "../chat/car-search.service.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ─── Utilitários ────────────────────────────────────────────────────────────

function truncateMessage(message = "", maxChars = 500) {
    const trimmed = message.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return trimmed.slice(0, maxChars).trimEnd() + "…";
}

function buildAssistantMessageContent(replyText, cars = []) {
    return JSON.stringify({
        text: replyText,
        cars: Array.isArray(cars) ? cars : [],
    });
}

function buildRagErrorReply(error) {
    const detail = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|aborted/i.test(detail);

    if (timedOut) {
        return [
            "A pesquisa no documento demorou demasiado e foi interrompida.",
            "",
            `Detalhe técnico: ${detail}`,
            "",
            "Confirma se o Ollama está aberto e tenta novamente.",
        ].join("\n");
    }

    return [
        "Não consegui obter uma resposta do manual neste momento.",
        "",
        `Detalhe técnico: ${detail}`,
        "",
        "Confirma se o serviço Python está ativo e se o Ollama está aberto.",
    ].join("\n");
}

async function fetchCarsByAnalysis(analysis, profile, rawMessage) {
    let query = supabaseAdmin.from("cars").select("*");
    query = applyCarFilters(query, analysis, profile, rawMessage);
    const { data, error } = await query.limit(200);
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : [];
}

async function ensureConversationOwner(conversationId, userId) {
    const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

    return !error && Boolean(data);
}

// ─── Rotas ──────────────────────────────────────────────────────────────────

router.post("/search-cars", async (req, res) => {
    try {
        const message = truncateMessage(req.body.message || "");

        if (!message) {
            return res.status(400).json({ error: "Mensagem obrigatoria" });
        }

        const profile = await getCarsSearchProfile();
        const analysis = await analyzeUserQuery(message, profile);
        const matchedCars = await fetchCarsByAnalysis(analysis, profile, message);
        const cars = finalizeCarSearchResults(matchedCars, analysis, profile, message);

        return res.json({
            reply: buildCarsReply(analysis, cars, message, matchedCars.length),
            cars,
            total_cars: matchedCars.length,
        });
    } catch (err) {
        console.error("Erro /search-cars:", err);
        return res.status(500).json({ error: "Erro no chat" });
    }
});

router.post("/ask", authenticateUser, async (req, res) => {
    try {
        const message = truncateMessage(req.body.message || "");
        const { conversation_id } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Mensagem obrigatoria" });
        }

        // ── Garantir conversa ──────────────────────────────────────────────
        let conversationId = conversation_id ?? null;

        if (!conversationId) {
            const { data: newConv, error: convError } = await supabaseAdmin
                .from("conversations")
                .insert({ user_id: req.user.id, title: message.slice(0, 60) })
                .select()
                .single();

            if (convError) {
                return res.status(500).json({ error: convError.message });
            }

            conversationId = newConv.id;
        } else {
            const ownsConversation = await ensureConversationOwner(conversationId, req.user.id);
            if (!ownsConversation) {
                return res.status(404).json({ error: "Conversa nao encontrada." });
            }
        }

        // ── Guardar mensagem do utilizador ─────────────────────────────────
        const { error: userMsgError } = await supabaseAdmin
            .from("messages")
            .insert({ conversation_id: conversationId, role: "user", content: message });

        if (userMsgError) {
            console.error("Erro ao guardar msg user:", userMsgError.message);
        }

        // ── Classificar intenção e responder ───────────────────────────────
        const profile = await getCarsSearchProfile();
        const analysis = await analyzeUserQuery(message, profile);

        let replyText = "";
        let replyCars = [];

        if (isCarSearchIntent(analysis)) {
            const matchedCars = await fetchCarsByAnalysis(analysis, profile, message);
            const cars = finalizeCarSearchResults(matchedCars, analysis, profile, message);
            replyText = buildCarsReply(analysis, cars, message, matchedCars.length);
            replyCars = cars;
        } else {
            try {
                const rag = await askRAGForConversation(message, req.user.id, conversationId);
                replyText = typeof rag.answer === "string" ? rag.answer : String(rag.answer);
            } catch (ragErr) {
                console.error("Erro RAG:", ragErr);
                replyText = buildRagErrorReply(ragErr);
            }
        }

        // ── Guardar resposta do assistente ─────────────────────────────────
        const { error: assistantMsgError } = await supabaseAdmin
            .from("messages")
            .insert({
                conversation_id: conversationId,
                role: "assistant",
                content: buildAssistantMessageContent(replyText, replyCars),
            });

        if (assistantMsgError) {
            console.error("Erro ao guardar msg assistant:", assistantMsgError.message);
        }

        return res.json({
            reply: replyText,
            cars: replyCars,
            total_cars: replyCars.length,
            conversation_id: conversationId,
        });

    } catch (err) {
        console.error("Erro /ask:", err);
        return res.status(500).json({ error: "Erro no chat" });
    }
});

export default router;