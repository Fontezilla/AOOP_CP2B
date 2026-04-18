import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabasePublishableKey || !supabaseSecretKey) {
    throw new Error("Faltam variáveis de ambiente do Supabase.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);