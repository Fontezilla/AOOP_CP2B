import express from "express";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

router.get("/me", authenticateUser, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("id, nome_completo, email, created_at")
            .eq("id", req.user.id)
            .single();

        if (error) {
            return res.status(404).json({
                error: "Perfil não encontrado."
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({
            error: "Erro ao obter perfil."
        });
    }
});

router.put("/me", authenticateUser, async (req, res) => {
    try {
        const { nomeCompleto } = req.body;

        if (!nomeCompleto || nomeCompleto.trim().length < 3) {
            return res.status(400).json({
                error: "Nome completo inválido."
            });
        }

        const { data, error } = await supabaseAdmin
            .from("profiles")
            .update({
                nome_completo: nomeCompleto.trim()
            })
            .eq("id", req.user.id)
            .select("id, nome_completo, email, created_at")
            .single();

        if (error) {
            return res.status(400).json({
                error: error.message
            });
        }

        return res.status(200).json({
            message: "Perfil atualizado com sucesso.",
            profile: data
        });
    } catch (err) {
        return res.status(500).json({
            error: "Erro ao atualizar perfil."
        });
    }
});

export default router;