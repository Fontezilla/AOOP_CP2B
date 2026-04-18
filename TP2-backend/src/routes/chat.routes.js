import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { askRAG } from "../rag/rag.service.js";
import {
    analyzeUserQuery,
    applyCarFilters,
    buildCarsReply,
    isCarSearchIntent,
} from "../chat/car-search.service.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

function buildCarsQuery(message, analysis) {
    let query = supabaseAdmin.from("cars").select("*");
    query = applyCarFilters(query, analysis, message);
    query = query
        .order("year", { ascending: false })
        .order("price", { ascending: true })
        .limit(8);

    return { analysis, query };
}

function buildAssistantMessageContent(replyText, cars = []) {
    return JSON.stringify({
        text: replyText,
        cars: Array.isArray(cars) ? cars : [],
    });
}

router.post("/search-cars", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Mensagem obrigatoria" });
        }

        const analysis = await analyzeUserQuery(message);
        const { query } = buildCarsQuery(message, analysis);
        const { data, error } = await query;

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        return res.json({
            reply: buildCarsReply(analysis, data || []),
            cars: data || [],
        });
    } catch (err) {
        return res.status(500).json({ error: "Erro no chat" });
    }
});

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

        const analysis = await analyzeUserQuery(message);
        const { query } = buildCarsQuery(message, analysis);
        const { data: cars, error: carsError } = await query;

        if (carsError) {
            return res.status(500).json({ error: carsError.message });
        }

        const shouldReturnCars = isCarSearchIntent(analysis, cars || []);
        let replyText = "";

        if (shouldReturnCars) {
            replyText = buildCarsReply(analysis, cars || []);
        } else {
            try {
                const rag = await askRAG(message);
                replyText = typeof rag.answer === "string" ? rag.answer : String(rag.answer);
            } catch (ragErr) {
                console.error("Erro RAG:", ragErr);
                replyText = "Não foi possível obter resposta. Tenta novamente.";
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
            conversation_id: conversationId,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro no chat" });
    }
});

export default router;
