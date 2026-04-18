import { supabaseAdmin } from "../config/supabase.js";

export async function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Acesso não autorizado. Token em falta."
            });
        }

        const token = authHeader.split(" ")[1];

        const {
            data: { user },
            error
        } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                error: "Token inválido ou expirado."
            });
        }

        req.user = user;
        req.token = token;

        next();
    } catch (err) {
        return res.status(500).json({
            error: "Erro interno na autenticação."
        });
    }
}