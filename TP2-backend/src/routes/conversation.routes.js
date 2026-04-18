import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", authenticateUser, async (req, res) => {
    try {
        const { title } = req.body;

        const { data, error } = await supabaseAdmin
            .from("conversations")
            .insert({
                user_id: req.user.id,
                title: title || "Nova conversa",
            })
            .select()
            .single();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: "Erro ao criar conversa" });
    }
});

router.get("/", authenticateUser, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("conversations")
            .select("*")
            .eq("user_id", req.user.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

        if (error) return res.status(400).json({ error: error.message });

        return res.json(data);
    } catch {
        return res.status(500).json({ error: "Erro ao listar conversas." });
    }
});

router.get("/:id/messages", authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseAdmin
            .from("messages")
            .select("*")
            .eq("conversation_id", id)
            .order("created_at", { ascending: true });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: "Erro ao obter mensagens" });
    }
});


router.post("/:id/messages", authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { role, content } = req.body;

        if (!role || !content) {
            return res.status(400).json({ error: "role e content são obrigatórios." });
        }

        const { data, error } = await supabaseAdmin
            .from("messages")
            .insert({ conversation_id: id, role, content })
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });

        return res.status(201).json(data);
    } catch {
        return res.status(500).json({ error: "Erro ao guardar mensagem." });
    }
});

router.patch("/:id", authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;

        if (!title || title.trim().length === 0) {
            return res.status(400).json({ error: "Título inválido." });
        }

        const { data, error } = await supabaseAdmin
            .from("conversations")
            .update({ title: title.trim() })
            .eq("id", id)
            .eq("user_id", req.user.id)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });

        return res.json(data);
    } catch {
        return res.status(500).json({ error: "Erro ao renomear conversa." });
    }
});

router.delete("/:id", authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from("conversations")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id)
            .eq("user_id", req.user.id)
            .is("deleted_at", null);

        if (error) return res.status(400).json({ error: error.message });

        return res.status(204).send();
    } catch {
        return res.status(500).json({ error: "Erro ao eliminar conversa." });
    }
});

export default router;