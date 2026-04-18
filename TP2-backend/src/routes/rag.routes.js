import express from "express";
import { askRAG } from "../rag/rag.service.js";

const router = express.Router();

router.post("/ask", async (req, res) => {
    try {
        const { question } = req.body;

        const result = await askRAG(question);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;