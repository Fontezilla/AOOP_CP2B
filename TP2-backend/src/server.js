import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import ragRoutes from "./routes/rag.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import documentRoutes from "./routes/document.routes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(helmet());

app.use(
    cors({
        origin: process.env.FRONTEND_URL,
        credentials: false
    })
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "15mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
    res.status(200).json({
        message: "API AutoMatch ativa."
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/documents", documentRoutes);

app.use((req, res) => {
    res.status(404).json({
        error: "Rota não encontrada."
    });
});

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        error: "Erro interno do servidor."
    });
});

app.listen(port, () => {
    console.log(`Servidor a correr em http://localhost:${port}`);
});
