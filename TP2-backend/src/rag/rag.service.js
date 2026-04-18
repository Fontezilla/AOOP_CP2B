import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import path from "path";

let vectorStore = null;

export async function initRAG() {
    console.log("1 - start");

    const filePath = path.join(process.cwd(), "rag/documents/manual.pdf");
    console.log("2 - caminho:", filePath);

    const loader = new PDFLoader(filePath);

    const docs = await loader.load();
    console.log("3 - PDF carregado:", docs.length);

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
    });

    const splitDocs = await splitter.splitDocuments(docs);
    console.log("4 - split feito:", splitDocs.length);

    const limitedDocs = splitDocs.slice(0, 100);
    console.log("5 - docs limitados:", limitedDocs.length);

    const embeddings = new OllamaEmbeddings({
        model: "nomic-embed-text",
    });

    console.log("6 - embeddings ready");

    vectorStore = await MemoryVectorStore.fromDocuments(
        limitedDocs,
        embeddings
    );

    console.log("7 - RAG inicializado com sucesso");
}

export async function askRAG(question) {
    if (!vectorStore) {
        throw new Error("RAG não inicializado");
    }

    const retriever = vectorStore.asRetriever();

    const relevantDocs = await retriever.getRelevantDocuments(question);

    const context = relevantDocs
        .map((doc) => doc.pageContent)
        .join("\n\n");

    const model = new ChatOllama({
        model: "mistral",
    });

    const prompt = `
Responde em Português de Portugal (pt-PT), evita expressões do português do Brasil.

Usa apenas a informação do contexto.

Se não souberes, diz que não tens informação suficiente.

Contexto:
${context}

Pergunta:
${question}

Resposta:
`;

    const response = await model.invoke(prompt);

    return {
        answer: response.content,
        sources: relevantDocs.slice(0, 3),
    };
}