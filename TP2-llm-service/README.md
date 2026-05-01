# AutoMatch LLM Service

Servico Python responsavel pela interpretacao de queries com Ollama e pelo RAG sobre o PDF do projeto.

## Arranque

```powershell
cd TP2-llm-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

O backend Node chama este servico por `LLM_SERVICE_URL`, que por defeito e `http://localhost:8000`.

O RAG usa embeddings e guarda cache em `.rag-cache`. A primeira pergunta técnica pode demorar enquanto o índice é criado; as seguintes reutilizam a cache. Para reconstruir manualmente:

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/rag/reindex
```

## Variaveis

Podes copiar `.env.example` para `.env` e ajustar os modelos ou o caminho do PDF.

Ollama precisa de ter estes modelos disponiveis:

```powershell
ollama pull mistral
ollama pull nomic-embed-text
```
