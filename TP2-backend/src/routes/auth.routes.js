import express from "express";
import { supabase, supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

router.post("/signup", async (req, res) => {
    try {
        const { nomeCompleto, email, password } = req.body;

        if (!nomeCompleto || !email || !password) {
            return res.status(400).json({
                error: "Nome completo, email e palavra-passe são obrigatórios."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "A palavra-passe deve ter pelo menos 8 caracteres."
            });
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nome_completo: nomeCompleto
                }
            }
        });

        if (error) {
            return res.status(400).json({
                error: error.message
            });
        }

        const user = data?.user;

        if (!user) {
            return res.status(400).json({
                error: "Não foi possível criar a conta."
            });
        }

        const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert({
                id: user.id,
                nome_completo: nomeCompleto,
                email
            });

        if (profileError) {
            return res.status(400).json({
                error: profileError.message
            });
        }

        return res.status(201).json({
            message: "Conta criada com sucesso.",
            needsEmailConfirmation: !data.session,
            user: {
                id: user.id,
                email: user.email,
                nomeCompleto
            }
        });
    } catch (err) {
        return res.status(500).json({
            error: "Erro interno no registo."
        });
    }
});

router.post("/signin", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Email e palavra-passe são obrigatórios."
            });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({
                error: error.message
            });
        }

        return res.status(200).json({
            message: "Sessão iniciada com sucesso.",
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
                expires_in: data.session.expires_in
            },
            user: {
                id: data.user.id,
                email: data.user.email,
                nomeCompleto: data.user.user_metadata?.nome_completo ?? null
            }
        });
    } catch (err) {
        return res.status(500).json({
            error: "Erro interno no login."
        });
    }
});

export default router;
