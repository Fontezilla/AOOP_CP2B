import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { askRAGForConversation } from "../rag/rag.service.js";
import {
    analyzeUserQuery,
    buildCarsReply,
    finalizeCarSearchResults,
    getCarsInventory,
    getCarsSearchProfile,
    isCarSearchIntent,
    searchCars,
} from "../chat/car-search.service.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

function buildAssistantMessageContent(replyText, cars = []) {
    return JSON.stringify({
        text: replyText,
        cars: Array.isArray(cars) ? cars : [],
    });
}

function normalizeMessage(value = "") {
    return String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isTechnicalQuestion(message = "") {
    const normalized = normalizeMessage(message);
    const hasQuestionAction = /\b(como|quando|porque|por que|qual|quais|onde|posso|devo|troco|trocar|mudo|mudar|substituo|substituir|verifico|verificar)\b/.test(normalized);
    const hasTechnicalTerm = /\b(oleo|bateria|motor|pneu|pneus|travao|travoes|filtro|filtros|luz|luzes|manutencao|revisao|avaria|manual|liquido|refrigerante|pressao)\b/.test(normalized);

    return hasQuestionAction && hasTechnicalTerm;
}

async function answerWithRag(message, userId, conversationId) {
    const rag = await askRAGForConversation(message, userId, conversationId);
    return typeof rag.answer === "string" ? rag.answer : String(rag.answer);
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
            "Confirma se o Ollama está aberto e tenta novamente. Em PDFs grandes, a primeira resposta pode demorar mais porque o modelo local ainda está a processar o contexto.",
        ].join("\n");
    }

    return [
        "Não consegui obter uma resposta do manual neste momento.",
        "",
        `Detalhe técnico: ${detail}`,
        "",
        "Confirma se o serviço Python está ativo, se o Ollama está aberto e se já executaste /rag/reindex para criar a cache de embeddings.",
    ].join("\n");
}

router.post("/search-cars", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Mensagem obrigatoria" });
        }

        const inventory = await getCarsInventory();
        const profile = await getCarsSearchProfile();
        const analysis = await analyzeUserQuery(message, profile);
        const matchedCars = searchCars(inventory, analysis, profile, message);
        const cars = finalizeCarSearchResults(matchedCars, analysis, profile, message);
        const count = matchedCars.length;

        return res.json({
            reply: buildCarsReply(analysis, cars, message, count),
            cars,
            total_cars: count ?? cars.length,
        });
    } catch (err) {
        return res.status(500).json({ error: "Erro no chat" });
    }
});

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

router.post("/ask", authenticateUser, async (req, res) => {
    try {
        const { message, conversation_id } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Mensagem obrigatoria" });
        }

        let conversationId = conversation_id ?? null;

        if (!conversationId) {
            const title = message.slice(0, 60);

            const { data: newConv, error: convError } = await supabaseAdmin
                .from("conversations")
                .insert({
                    user_id: req.user.id,
                    title,
                })
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

        const { error: userMsgError } = await supabaseAdmin
            .from("messages")
            .insert({
                conversation_id: conversationId,
                role: "user",
                content: message,
            });

        if (userMsgError) {
            console.error("Erro ao guardar msg user:", userMsgError.message);
        }

        if (isTechnicalQuestion(message)) {
            let replyText = "";

            try {
                replyText = await answerWithRag(message, req.user.id, conversationId);
            } catch (ragErr) {
                console.error("Erro RAG:", ragErr);
                replyText = buildRagErrorReply(ragErr);
            }

            const { error: assistantMsgError } = await supabaseAdmin
                .from("messages")
                .insert({
                    conversation_id: conversationId,
                    role: "assistant",
                    content: buildAssistantMessageContent(replyText, []),
                });

            if (assistantMsgError) {
                console.error("Erro ao guardar msg assistant:", assistantMsgError.message);
            }

            return res.json({
                reply: replyText,
                cars: [],
                total_cars: 0,
                conversation_id: conversationId,
            });
        }

        const inventory = await getCarsInventory();
        const profile = await getCarsSearchProfile();
        const analysis = await analyzeUserQuery(message, profile);
        const matchedCars = searchCars(inventory, analysis, profile, message);
        const cars = finalizeCarSearchResults(matchedCars, analysis, profile, message);
        const count = matchedCars.length;

        const shouldReturnCars = isCarSearchIntent(analysis, cars || []);
        let replyText = "";

        if (shouldReturnCars) {
            replyText = buildCarsReply(analysis, cars || [], message, count);
        } else {
            try {
                const rag = await askRAGForConversation(message, req.user.id, conversationId);
                replyText = typeof rag.answer === "string" ? rag.answer : String(rag.answer);
            } catch (ragErr) {
                console.error("Erro RAG:", ragErr);
                replyText = buildRagErrorReply(ragErr);
            }
        }

        const { error: assistantMsgError } = await supabaseAdmin
            .from("messages")
            .insert({
                conversation_id: conversationId,
                role: "assistant",
                content: buildAssistantMessageContent(replyText, shouldReturnCars ? cars || [] : []),
            });

        if (assistantMsgError) {
            console.error("Erro ao guardar msg assistant:", assistantMsgError.message);
        }

        return res.json({
            reply: replyText,
            cars: shouldReturnCars ? cars || [] : [],
            total_cars: shouldReturnCars ? (count ?? cars.length) : 0,
            conversation_id: conversationId,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro no chat" });
    }
});

export default router;
