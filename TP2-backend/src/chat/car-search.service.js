import { ChatOllama } from "@langchain/community/chat_models/ollama";

const queryUnderstandingModel = new ChatOllama({
    model: process.env.OLLAMA_QUERY_MODEL || "mistral",
    format: "json",
    temperature: 0,
});

function normalizeWhitespace(value = "") {
    return String(value).replace(/\s+/g, " ").trim();
}

function extractJsonObject(value) {
    const text = normalizeWhitespace(value);

    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");

        if (start === -1 || end === -1 || end <= start) {
            return null;
        }

        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

function sanitizeText(value = "") {
    if (value === null || value === undefined) {
        return "";
    }

    return normalizeWhitespace(value)
        .replace(/[%(),]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = sanitizeText(value);
    return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value);
    }

    if (typeof value === "string") {
        const digits = value.replace(/[^\d]/g, "");
        if (digits.length > 0) {
            return Number.parseInt(digits, 10);
        }
    }

    return null;
}

function normalizeIntent(value) {
    return value === "car_search" || value === "technical_question" || value === "unknown"
        ? value
        : "unknown";
}

function normalizeAnalysis(raw, fallbackSearchText = "") {
    const filters = raw?.filters && typeof raw.filters === "object" ? raw.filters : {};
    const extraTerms = Array.isArray(raw?.extraTerms)
        ? raw.extraTerms.map(normalizeOptionalString).filter(Boolean)
        : [];

    return {
        intent: normalizeIntent(raw?.intent),
        filters: {
            brand: normalizeOptionalString(filters.brand),
            model: normalizeOptionalString(filters.model),
            fuel: normalizeOptionalString(filters.fuel),
            maxPrice: normalizeOptionalNumber(filters.maxPrice),
            minPrice: normalizeOptionalNumber(filters.minPrice),
            maxYear: normalizeOptionalNumber(filters.maxYear),
            minYear: normalizeOptionalNumber(filters.minYear),
            maxMileage: normalizeOptionalNumber(filters.maxMileage),
        },
        searchText: normalizeOptionalString(raw?.searchText) || normalizeOptionalString(fallbackSearchText),
        extraTerms,
    };
}

function getModelContent(content) {
    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") {
                    return part;
                }

                if (part && typeof part === "object" && "text" in part) {
                    return String(part.text);
                }

                return "";
            })
            .join("");
    }

    return JSON.stringify(content ?? "");
}

export async function analyzeUserQuery(message) {
    const prompt = `
Analisa a mensagem de um utilizador de uma plataforma automovel e devolve apenas JSON valido.

Contexto:
- A base de dados de carros tem as colunas: title, brand, model, price, year, mileage, fuel, image_url, url.
- "car_search" significa que o utilizador quer encontrar carros do inventario real da plataforma.
- "technical_question" significa duvidas de manutencao, avarias, manuais, luzes, problemas ou explicacoes tecnicas.
- "unknown" significa que a mensagem e ambigua e nao da para decidir com seguranca.

Regras:
- Extrai filtros apenas quando estiverem explicitos ou fortemente implicitos.
- "searchText" deve conter apenas termos livres uteis para pesquisar texto na BD e que nao estejam ja representados nos filtros.
- "extraTerms" e uma lista curta opcional para termos adicionais de pesquisa.
- Usa null quando nao houver valor.
- Nao inventes marcas, modelos ou limites numericos.
- Se o utilizador disser "BMWs ate 2018 a gasolina", isso e "car_search" com brand "BMW", maxYear 2018 e fuel "gasolina".
- Se o utilizador perguntar "luz do motor acesa o que significa", isso e "technical_question".

Schema:
{
  "intent": "car_search" | "technical_question" | "unknown",
  "filters": {
    "brand": string | null,
    "model": string | null,
    "fuel": string | null,
    "maxPrice": number | null,
    "minPrice": number | null,
    "maxYear": number | null,
    "minYear": number | null,
    "maxMileage": number | null
  },
  "searchText": string | null,
  "extraTerms": string[]
}

Mensagem:
${message}
`;

    try {
        const response = await queryUnderstandingModel.invoke(prompt);
        const content = getModelContent(response.content);
        const parsed = extractJsonObject(content);

        if (!parsed) {
            return normalizeAnalysis({ intent: "unknown" }, message);
        }

        return normalizeAnalysis(parsed, message);
    } catch (error) {
        return normalizeAnalysis({ intent: "unknown" }, message);
    }
}

function buildOrClause(terms = []) {
    const safeTerms = terms
        .map((term) => sanitizeText(term))
        .filter(Boolean);

    if (safeTerms.length === 0) {
        return null;
    }

    const clauses = [];

    for (const term of safeTerms) {
        clauses.push(`title.ilike.%${term}%`);
        clauses.push(`brand.ilike.%${term}%`);
        clauses.push(`model.ilike.%${term}%`);
        clauses.push(`fuel.ilike.%${term}%`);
    }

    return clauses.join(",");
}

function hasStructuredFilters(analysis) {
    const filters = analysis?.filters || {};

    return Boolean(
        filters.brand ||
        filters.model ||
        filters.fuel ||
        filters.maxPrice ||
        filters.minPrice ||
        filters.maxYear ||
        filters.minYear ||
        filters.maxMileage
    );
}

function getEffectiveTextTerms(analysis) {
    if (hasStructuredFilters(analysis)) {
        return [];
    }

    return [
        analysis?.searchText,
        ...(analysis?.extraTerms || []),
    ];
}

export function applyCarFilters(query, analysis, rawMessage = "") {
    let nextQuery = query;
    const filters = analysis?.filters || {};
    const structuredFiltersPresent = hasStructuredFilters(analysis);

    if (filters.maxPrice) {
        nextQuery = nextQuery.lte("price", filters.maxPrice);
    }

    if (filters.minPrice) {
        nextQuery = nextQuery.gte("price", filters.minPrice);
    }

    if (filters.maxYear) {
        nextQuery = nextQuery.lte("year", filters.maxYear);
    }

    if (filters.minYear) {
        nextQuery = nextQuery.gte("year", filters.minYear);
    }

    if (filters.maxMileage) {
        nextQuery = nextQuery.lte("mileage", filters.maxMileage);
    }

    if (filters.brand) {
        nextQuery = nextQuery.ilike("brand", `%${sanitizeText(filters.brand)}%`);
    }

    if (filters.model) {
        nextQuery = nextQuery.ilike("model", `%${sanitizeText(filters.model)}%`);
    }

    if (filters.fuel) {
        nextQuery = nextQuery.ilike("fuel", `%${sanitizeText(filters.fuel)}%`);
    }

    const orClause = buildOrClause(getEffectiveTextTerms(analysis));

    if (orClause) {
        nextQuery = nextQuery.or(orClause);
    } else if (!structuredFiltersPresent) {
        const fallbackClause = buildOrClause([rawMessage]);

        if (fallbackClause) {
            nextQuery = nextQuery.or(fallbackClause);
        }
    }

    return nextQuery;
}

function formatPrice(value) {
    if (typeof value !== "number") {
        return "preco n/d";
    }

    return `${Math.round(value)} EUR`;
}

function formatLabel(value) {
    return String(value)
        .split(" ")
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");
}

export function isCarSearchIntent(analysis, cars = []) {
    if (analysis?.intent === "car_search") {
        return true;
    }

    if (analysis?.intent === "technical_question") {
        return false;
    }

    return cars.length > 0;
}

export function buildCarsReply(analysis, cars) {
    const filters = analysis?.filters || {};
    const activeFilters = [];
    const effectiveTextTerms = getEffectiveTextTerms(analysis);

    if (filters.brand) activeFilters.push(`marca ${formatLabel(filters.brand)}`);
    if (filters.model) activeFilters.push(`modelo ${formatLabel(filters.model)}`);
    if (filters.maxYear) activeFilters.push(`ano ate ${filters.maxYear}`);
    if (filters.minYear) activeFilters.push(`ano desde ${filters.minYear}`);
    if (filters.maxPrice) activeFilters.push(`preco ate ${filters.maxPrice} EUR`);
    if (filters.minPrice) activeFilters.push(`preco desde ${filters.minPrice} EUR`);
    if (filters.maxMileage) activeFilters.push(`quilometragem ate ${filters.maxMileage} km`);
    if (filters.fuel) activeFilters.push(`combustivel ${filters.fuel}`);
    if (effectiveTextTerms.length > 0) {
        activeFilters.push(`termos "${effectiveTextTerms.join(", ")}"`);
    }

    if (!cars.length) {
        const context = activeFilters.length > 0
            ? ` com ${activeFilters.join(", ")}`
            : "";

        return `Nao encontrei carros${context}. Ajusta a pesquisa e tenta novamente.`;
    }

    const intro = activeFilters.length > 0
        ? `Encontrei ${cars.length} carros com ${activeFilters.join(", ")}.`
        : `Encontrei ${cars.length} carros relevantes.`;

    const lines = cars.map((car, index) => {
        const year = car.year ?? "ano n/d";
        const fuel = car.fuel || "combustivel n/d";
        return `${index + 1}. ${car.title} - ${year} - ${fuel} - ${formatPrice(car.price)}`;
    });

    return [
        intro,
        "",
        ...lines,
        "",
        "Os cards abaixo mostram imagem e link direto para cada anuncio.",
    ].join("\n");
}
