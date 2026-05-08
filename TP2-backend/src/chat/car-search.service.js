import { supabaseAdmin } from "../config/supabase.js";
import { analyzeQueryWithLlm } from "../llm/llm-client.js";

const SEARCH_PROFILE_TTL_MS = 5 * 60 * 1000;
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ANALYSIS_CACHE_ENTRIES = 200;
const ANALYSIS_CACHE_VERSION = "v10";
const SEARCH_PHRASE_MAX_TOKENS = 3;
const MAX_REPLY_LIST_ITEMS = 12;

const GENERIC_SEARCH_STOPWORDS = new Set([
    "a",
    "ao",
    "aos",
    "as",
    "ate",
    "carro",
    "carros",
    "com",
    "como",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "que",
    "me",
    "mostrar",
    "mostra",
    "mostra-me",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "preciso",
    "procuro",
    "quero",
    "todo",
    "todos",
    "toda",
    "todas",
    "tem",
    "tens",
    "tenho",
    "um",
    "uma",
    "mais",
    "menos",
    "maior",
    "maiores",
    "menor",
    "menores",
    "mil",
    "km",
    "kms",
    "quilometro",
    "quilometros",
    "quilometragem",
    "cor",
    "cores",
    "caixa",
    "caixas",
    "transmissao",
    "transmissão",
    "tipo",
    "tipos",
    "euro",
    "euros",
    "eur",
    "cv",
    "cvs",
    "ano",
    "anos",
    "porta",
    "portas",
    "lugar",
    "lugares",
    "veiculo",
    "veiculos",
    "viatura",
    "viaturas",
]);

let cachedCarsSearchProfile = null;
let cachedCarsSearchProfileAt = 0;
let carsSearchProfilePromise = null;
const analysisCache = new Map();

function normalizeWhitespace(value = "") {
    return String(value).replace(/\s+/g, " ").trim();
}

function sanitizeText(value = "") {
    if (value === null || value === undefined) {
        return "";
    }

    return normalizeWhitespace(value)
        .replace(/[^\p{L}\p{N}\s/-]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getAnalysisCacheKey(message = "") {
    return `${ANALYSIS_CACHE_VERSION}:${stripDiacritics(normalizeWhitespace(message).toLowerCase())}`;
}

function getCachedAnalysis(message = "") {
    const key = getAnalysisCacheKey(message);
    const cached = analysisCache.get(key);

    if (!cached) {
        return null;
    }

    if (Date.now() - cached.createdAt > ANALYSIS_CACHE_TTL_MS) {
        analysisCache.delete(key);
        return null;
    }

    return cached.value;
}

function setCachedAnalysis(message = "", analysis) {
    const key = getAnalysisCacheKey(message);

    analysisCache.set(key, {
        value: analysis,
        createdAt: Date.now(),
    });

    if (analysisCache.size <= MAX_ANALYSIS_CACHE_ENTRIES) {
        return;
    }

    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) {
        analysisCache.delete(oldestKey);
    }
}

function stripDiacritics(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
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

function dedupeStrings(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function splitTextIntoRawTokens(value = "") {
    return sanitizeText(value)
        .toLowerCase()
        .split(/[\s/-]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function normalizeSearchTokenSignature(token = "") {
    let normalized = stripDiacritics(String(token).toLowerCase())
        .replace(/[^a-z0-9]/g, "");

    if (!normalized) {
        return "";
    }

    if (normalized.length > 3 && normalized.endsWith("s")) {
        normalized = normalized.slice(0, -1);
    }

    if (normalized.length > 4 && /[ao]$/.test(normalized)) {
        normalized = normalized.slice(0, -1);
    }

    return normalized;
}

function getLevenshteinDistance(left = "", right = "") {
    if (left === right) {
        return 0;
    }

    if (!left) {
        return right.length;
    }

    if (!right) {
        return left.length;
    }

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array(right.length + 1).fill(0);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        current[0] = leftIndex;

        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + substitutionCost,
            );
        }

        for (let index = 0; index <= right.length; index += 1) {
            previous[index] = current[index];
        }
    }

    return previous[right.length];
}

function areSearchSignaturesEquivalent(left = "", right = "") {
    const normalizedLeft = normalizeSearchTokenSignature(left);
    const normalizedRight = normalizeSearchTokenSignature(right);

    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    if (normalizedLeft === normalizedRight) {
        return true;
    }

    if (/^\d+$/.test(normalizedLeft) || /^\d+$/.test(normalizedRight)) {
        return false;
    }

    const minLength = Math.min(normalizedLeft.length, normalizedRight.length);
    if (minLength < 4) {
        return false;
    }

    const distance = getLevenshteinDistance(normalizedLeft, normalizedRight);
    if (distance <= (minLength >= 6 ? 2 : 1)) {
        return true;
    }

    const confusableLeft = normalizedLeft.replace(/i/g, "l");
    const confusableRight = normalizedRight.replace(/i/g, "l");

    if (minLength >= 6 && (confusableLeft !== normalizedLeft || confusableRight !== normalizedRight)) {
        return getLevenshteinDistance(confusableLeft, confusableRight) <= 2;
    }

    return false;
}

function signatureSetHasEquivalent(signatures, target) {
    for (const signature of signatures) {
        if (areSearchSignaturesEquivalent(signature, target)) {
            return true;
        }
    }

    return false;
}

const GENERIC_SEARCH_STOPWORD_SIGNATURES = new Set(
    [...GENERIC_SEARCH_STOPWORDS]
        .map((token) => normalizeSearchTokenSignature(token))
        .filter(Boolean),
);

const WRITTEN_NUMBERS_PT = new Map([
    ["um", 1],
    ["uma", 1],
    ["dois", 2],
    ["duas", 2],
    ["tres", 3],
    ["três", 3],
    ["quatro", 4],
    ["cinco", 5],
    ["seis", 6],
    ["sete", 7],
    ["oito", 8],
    ["nove", 9],
]);

const COLUMN_LABELS_PT = {
    brand: "marca",
    model: "modelo",
    price: "preco",
    year: "ano",
    mileage: "quilometragem",
    fuel: "combustivel",
    transmission: "caixa",
    cilindrada: "cilindrada",
    power_cv: "potencia",
    color: "cor",
    doors: "portas",
    seats: "lugares",
    traction: "tracao",
    section: "seccao",
    vehicle_type: "tipo de veiculo",
    month: "mes",
};

const NUMERIC_COLUMN_ALIASES = {
    price: ["preco", "preço", "eur", "euro", "euros", "custa", "custar", "barato"],
    year: ["ano", "anos", "desde", "apos", "após"],
    mileage: ["km", "kms", "quilometro", "quilometros", "quilometragem"],
    power_cv: ["cv", "cvs", "potencia", "potência", "cavalos"],
    doors: ["porta", "portas"],
    seats: ["lugar", "lugares", "assento", "assentos"],
};

const EXACT_NUMERIC_COLUMN_ALIASES = {
    doors: ["porta", "portas"],
    seats: ["lugar", "lugares", "assento", "assentos"],
};

const COLOR_ALIASES = [
    ["preto", /\bpret[ao]s?\b/],
    ["branco", /\bbranc[ao]s?\b/],
    ["cinzento", /\bcinzent[ao]s?\b|\bcinz[ao]s?\b/],
    ["prata", /\bpratas?\b/],
    ["azul", /\bazuis?\b|\bazul\b/],
    ["vermelho", /\bvermelh[ao]s?\b/],
];

function getNormalizedMessage(value = "") {
    return stripDiacritics(String(value).toLowerCase());
}

function profileHasColumn(profile, column) {
    return Array.isArray(profile?.allColumns) && profile.allColumns.includes(column);
}

function parseExplicitCount(message, nouns = []) {
    const normalized = getNormalizedMessage(message);
    const nounPattern = nouns.map((noun) => stripDiacritics(noun)).join("|");

    if (!nounPattern) {
        return null;
    }

    const digitMatch = normalized.match(new RegExp(`\\b(\\d{1,2})\\s*(?:${nounPattern})\\b`, "i"));
    if (digitMatch) {
        return Number.parseInt(digitMatch[1], 10);
    }

    for (const [word, value] of WRITTEN_NUMBERS_PT.entries()) {
        const normalizedWord = stripDiacritics(word);
        const wordRegex = new RegExp(`\\b${normalizedWord}\\s*(?:${nounPattern})\\b`, "i");

        if (wordRegex.test(normalized)) {
            return value;
        }
    }

    return null;
}

function parsePortugueseNumber(value = "") {
    const normalized = getNormalizedMessage(value).replace(",", ".").trim();
    const match = normalized.match(/\b(\d+(?:\.\d+)?)\s*(mil|k)?\b/);

    if (!match) {
        return null;
    }

    const base = Number.parseFloat(match[1]);
    if (!Number.isFinite(base)) {
        return null;
    }

    return Math.round(base * (match[2] ? 1000 : 1));
}

function inferDeterministicRanges(rawMessage = "", profile = getEmptyCarsSearchProfile()) {
    const rangeFilters = {};
    const normalized = getNormalizedMessage(rawMessage);
    const numericColumns = new Set(profile?.numericColumns || []);

    if (numericColumns.has("mileage") || profileHasColumn(profile, "mileage")) {
        const maxMileageMatch = normalized.match(/\b(?:ate|menos de|abaixo de|maximo|max)\s+(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(?:km|kms|quilometros?)\b/);
        const mileageWithSuffixMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(?:km|kms|quilometros?)\b/);
        const selectedMatch = maxMileageMatch || mileageWithSuffixMatch;

        if (selectedMatch) {
            const amount = parsePortugueseNumber(`${selectedMatch[1]} ${selectedMatch[2] || ""}`);
            if (amount !== null) {
                rangeFilters.mileage = { min: null, max: amount };
            }
        }
    }

    if (numericColumns.has("price") || profileHasColumn(profile, "price")) {
        const maxPriceMatch = normalized.match(/\b(?:ate|menos de|abaixo de|maximo|max)\s+(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(?:eur|euros?|€)?\b/);

        if (maxPriceMatch && /\b(eur|euros?|€|preco|barato|custa|custar)\b/.test(normalized)) {
            const amount = parsePortugueseNumber(`${maxPriceMatch[1]} ${maxPriceMatch[2] || ""}`);
            if (amount !== null) {
                rangeFilters.price = { min: null, max: amount };
            }
        }
    }

    return rangeFilters;
}

function getColumnAliases(column = "") {
    return NUMERIC_COLUMN_ALIASES[column] || [
        column,
        formatColumnLabel(column),
        String(column).replace(/_/g, " "),
    ];
}

function buildAliasPattern(aliases = []) {
    return aliases
        .map((alias) => stripDiacritics(String(alias).toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .filter(Boolean)
        .join("|");
}

function parseRangeForColumn(normalizedMessage, column) {
    const aliasPattern = buildAliasPattern(getColumnAliases(column));
    const numberPattern = "(\\d+(?:[.,]\\d+)?)\\s*(mil|k)?";

    if (!aliasPattern) {
        return null;
    }

    const maxPatterns = [
        new RegExp(`\\b(?:ate|menos de|abaixo de|maximo|max)\\s+${numberPattern}\\s*(?:${aliasPattern})\\b`),
        new RegExp(`\\b(?:${aliasPattern})\\s*(?:ate|menos de|abaixo de|maximo|max)\\s+${numberPattern}\\b`),
    ];
    const minPatterns = [
        new RegExp(`\\b(?:desde|a partir de|mais de|acima de|minimo|min)\\s+${numberPattern}\\s*(?:${aliasPattern})\\b`),
        new RegExp(`\\b(?:${aliasPattern})\\s*(?:desde|a partir de|mais de|acima de|minimo|min)\\s+${numberPattern}\\b`),
    ];

    for (const pattern of maxPatterns) {
        const match = normalizedMessage.match(pattern);
        if (match) {
            const amount = parsePortugueseNumber(`${match[1]} ${match[2] || ""}`);
            return amount !== null ? { min: null, max: amount } : null;
        }
    }

    for (const pattern of minPatterns) {
        const match = normalizedMessage.match(pattern);
        if (match) {
            const amount = parsePortugueseNumber(`${match[1]} ${match[2] || ""}`);
            return amount !== null ? { min: amount, max: null } : null;
        }
    }

    const suffixPattern = new RegExp(`\\b${numberPattern}\\s*(?:${aliasPattern})\\b`);
    const suffixMatch = normalizedMessage.match(suffixPattern);
    if (suffixMatch && ["mileage", "price", "power_cv"].includes(column)) {
        const amount = parsePortugueseNumber(`${suffixMatch[1]} ${suffixMatch[2] || ""}`);
        return amount !== null ? { min: null, max: amount } : null;
    }

    if (column === "year") {
        const minYearMatch = normalizedMessage.match(/\b(?:desde|a partir de|apos|após)\s+((?:19|20)\d{2})\b/);
        const maxYearMatch = normalizedMessage.match(/\b(?:ate|antes de)\s+((?:19|20)\d{2})\b/);

        if (minYearMatch) {
            return { min: Number.parseInt(minYearMatch[1], 10), max: null };
        }

        if (maxYearMatch) {
            return { min: null, max: Number.parseInt(maxYearMatch[1], 10) };
        }
    }

    return null;
}

function inferGenericDeterministicRanges(rawMessage = "", profile = getEmptyCarsSearchProfile()) {
    const rangeFilters = inferDeterministicRanges(rawMessage, profile);
    const normalized = getNormalizedMessage(rawMessage);

    for (const column of profile?.numericColumns || []) {
        if (rangeFilters[column]) {
            continue;
        }

        const range = parseRangeForColumn(normalized, column);
        if (range) {
            rangeFilters[column] = range;
        }
    }

    return rangeFilters;
}

function getMessageSignatureSet(rawMessage = "") {
    return buildSemanticSignatureSet(rawMessage);
}

function getCandidateMatchScore(candidate, messageSignatures) {
    const candidateSignatures = buildSemanticSignatureSet(candidate);

    if (candidateSignatures.size === 0) {
        return 0;
    }

    let overlap = 0;
    let nonNumericOverlap = 0;
    for (const signature of candidateSignatures) {
        if (signatureSetHasEquivalent(messageSignatures, signature)) {
            overlap += 1;

            if (!/^\d+$/.test(signature)) {
                nonNumericOverlap += 1;
            }
        }
    }

    if (overlap === 0 || nonNumericOverlap === 0) {
        return 0;
    }

    return overlap === candidateSignatures.size ? overlap + 2 : overlap;
}

function inferKnownTextFilters(rawMessage = "", profile = getEmptyCarsSearchProfile()) {
    const exactFilters = {};
    const messageSignatures = getMessageSignatureSet(rawMessage);
    const valuesByColumn = profile?.distinctTextValuesByColumn || {};
    const filterableColumns = new Set(profile?.filterableTextColumns || []);
    const candidateColumns = Object.keys(valuesByColumn)
        .filter((column) => filterableColumns.has(column) || profileHasColumn(profile, column));

    for (const column of candidateColumns) {
        const candidates = valuesByColumn[column];

        if (!Array.isArray(candidates) || candidates.length === 0) {
            continue;
        }

        const matches = [];

        for (const candidate of candidates) {
            if (typeof candidate !== "string" || !candidate.trim()) {
                continue;
            }

            const score = getCandidateMatchScore(candidate, messageSignatures);
            if (score > 0) {
                matches.push({
                    candidate,
                    score,
                });
            }
        }

        if (matches.length === 1) {
            exactFilters[column] = matches[0].candidate;
            continue;
        }

        if (matches.length > 1) {
            exactFilters[column] = matches
                .sort((left, right) => right.score - left.score)
                .map((match) => match.candidate);
        }
    }

    return exactFilters;
}

function getTextCandidateMatchesInText(value = "", profile = getEmptyCarsSearchProfile(), column = "") {
    const candidates = profile?.distinctTextValuesByColumn?.[column] || [];
    const messageSignatures = getMessageSignatureSet(value);

    if (!Array.isArray(candidates) || candidates.length === 0) {
        return [];
    }

    return candidates
        .map((candidate) => ({
            candidate,
            score: typeof candidate === "string"
                ? getCandidateMatchScore(candidate, messageSignatures)
                : 0,
        }))
        .filter((match) => match.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((match) => match.candidate);
}

function getColorMatchesInText(value = "", profile = getEmptyCarsSearchProfile()) {
    const normalized = getNormalizedMessage(value);
    const aliases = COLOR_ALIASES
        .filter(([, regex]) => regex.test(normalized))
        .map(([color]) => color);

    return dedupeStrings([
        ...aliases,
        ...getTextCandidateMatchesInText(value, profile, "color"),
    ]);
}

function buildFilterGroupCombinations(entries, index = 0, current = {}, results = []) {
    if (index >= entries.length) {
        results.push({ ...current });
        return results;
    }

    const [column, values] = entries[index];

    for (const value of values) {
        current[column] = value;
        buildFilterGroupCombinations(entries, index + 1, current, results);
    }

    delete current[column];
    return results;
}

function getSegmentTextMatches(segment = "", profile = getEmptyCarsSearchProfile(), column = "") {
    if (column === "color") {
        return getColorMatchesInText(segment, profile);
    }

    return getTextCandidateMatchesInText(segment, profile, column);
}

function inferAlternativeFilterGroups(rawMessage = "", profile = getEmptyCarsSearchProfile()) {
    const filterableColumns = (profile?.filterableTextColumns || [])
        .filter((column) => !["title", "url", "image_url"].includes(column));

    if (filterableColumns.length < 2) {
        return [];
    }

    const segments = getNormalizedMessage(rawMessage)
        .split(/\b(?:e|ou)\b|[,;]/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const groups = [];
    let matchedSegments = 0;

    for (const segment of segments) {
        const entries = filterableColumns
            .map((column) => [
                column,
                getSegmentTextMatches(segment, profile, column),
            ])
            .filter(([, values]) => values.length > 0);

        if (entries.length < 2) {
            continue;
        }

        matchedSegments += 1;

        for (const exactFilters of buildFilterGroupCombinations(entries).slice(0, 20)) {
            groups.push({
                exactFilters,
                rangeFilters: {},
            });
        }
    }

    if (matchedSegments < 2 || groups.length < 2) {
        return [];
    }

    const seen = new Set();
    return groups.filter((group) => {
        const key = Object.entries(group.exactFilters)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([column, value]) => `${column}:${normalizeSearchTokenSignature(value)}`)
            .join("|");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function inferDeterministicFilters(rawMessage = "", profile = getEmptyCarsSearchProfile()) {
    const exactFilters = inferKnownTextFilters(rawMessage, profile);
    const normalized = getNormalizedMessage(rawMessage);
    const numericColumns = new Set(profile?.numericColumns || []);
    const textColumns = new Set(profile?.filterableTextColumns || []);

    if (numericColumns.has("doors") || profileHasColumn(profile, "doors")) {
        const doors = parseExplicitCount(rawMessage, ["porta", "portas"]);
        if (doors !== null) {
            exactFilters.doors = doors;
        }
    }

    if (numericColumns.has("seats") || profileHasColumn(profile, "seats")) {
        const seats = parseExplicitCount(rawMessage, ["lugar", "lugares", "assento", "assentos"]);
        if (seats !== null) {
            exactFilters.seats = seats;
        }
    }

    if (textColumns.has("transmission") || profileHasColumn(profile, "transmission")) {
        const transmissions = [];

        if (/\b(?:manual|manuais)\b/.test(normalized)) {
            transmissions.push("manual");
        }

        if (/\bautomatic[ao]s?\b/.test(normalized)) {
            transmissions.push("automatica");
        }

        if (transmissions.length === 1) {
            exactFilters.transmission = transmissions[0];
        } else if (transmissions.length > 1) {
            exactFilters.transmission = dedupeStrings(transmissions);
        }
    }

    if (textColumns.has("color") || profileHasColumn(profile, "color")) {
        const colors = COLOR_ALIASES
            .filter(([, regex]) => regex.test(normalized))
            .map(([value]) => value);

        if (colors.length === 1) {
            exactFilters.color = colors[0];
        } else if (colors.length > 1) {
            exactFilters.color = dedupeStrings(colors);
        }
    }

    for (const column of profile?.numericColumns || []) {
        if (exactFilters[column] !== undefined) {
            continue;
        }

        const aliases = EXACT_NUMERIC_COLUMN_ALIASES[column];
        if (!aliases) {
            continue;
        }

        const value = parseExplicitCount(rawMessage, aliases);
        if (value !== null) {
            exactFilters[column] = value;
        }
    }

    return { exactFilters };
}

function removeStructuredFilterNoise(analysis, terms = []) {
    const exactFilters = analysis?.exactFilters || {};
    const blockedSignatures = new Set();

    if ("transmission" in exactFilters) {
        for (const token of ["caixa", "transmissao", "transmissão", "manual", "manuais", "automatica", "automatico"]) {
            blockedSignatures.add(normalizeSearchTokenSignature(token));
        }
    }

    if ("color" in exactFilters) {
        for (const token of ["cor", "cores", ...[].concat(exactFilters.color)]) {
            blockedSignatures.add(normalizeSearchTokenSignature(token));
        }
    }

    for (const [column, value] of Object.entries(exactFilters)) {
        if (["doors", "seats", "color", "transmission"].includes(column)) {
            continue;
        }

        for (const token of [].concat(value)) {
            if (typeof token === "string") {
                for (const signature of buildSemanticSignatureSet(token)) {
                    blockedSignatures.add(signature);
                }
            } else {
                blockedSignatures.add(normalizeSearchTokenSignature(String(token)));
            }
        }
    }

    if ("doors" in exactFilters) {
        for (const token of ["porta", "portas", String(exactFilters.doors)]) {
            blockedSignatures.add(normalizeSearchTokenSignature(token));
        }
    }

    if ("seats" in exactFilters) {
        for (const token of ["lugar", "lugares", "assento", "assentos", String(exactFilters.seats)]) {
            blockedSignatures.add(normalizeSearchTokenSignature(token));
        }
    }

    return terms.filter((term) => {
        const signatures = buildSemanticSignatureSet(term);

        for (const signature of signatures) {
            if (blockedSignatures.has(signature)) {
                return false;
            }
        }

        return true;
    });
}

function buildSearchFragments(value = "") {
    const rawTokens = splitTextIntoRawTokens(value);
    const fragments = rawTokens
        .filter((token) => isSearchTokenUseful(token, false))
        .map((token) => normalizeSearchTokenSignature(token))
        .filter((token) => token.length >= 2);

    if (fragments.length > 0) {
        return dedupeStrings(fragments);
    }

    const fallback = normalizeSearchTokenSignature(value);
    return fallback ? [fallback] : [];
}

function buildSemanticSignatureSet(value = "") {
    return new Set(buildSearchFragments(value));
}

function semanticSetsOverlap(leftSet, rightSet) {
    for (const token of leftSet) {
        if (signatureSetHasEquivalent(rightSet, token)) {
            return true;
        }
    }

    return false;
}

function countSemanticSetOverlap(leftSet, rightSet) {
    let overlap = 0;

    for (const token of leftSet) {
        if (signatureSetHasEquivalent(rightSet, token)) {
            overlap += 1;
        }
    }

    return overlap;
}

function isMetadataColumn(column = "") {
    const normalized = String(column).toLowerCase();

    return normalized === "id" ||
        normalized === "url" ||
        normalized.endsWith("_url") ||
        normalized.endsWith("_at");
}

function getEmptyCarsSearchProfile() {
    return {
        allColumns: [],
        textColumns: [],
        numericColumns: [],
        searchableTextColumns: [],
        filterableTextColumns: [],
        distinctTextValuesByColumn: {},
    };
}

function inferCarsSearchProfile(rows = []) {
    const allColumns = dedupeStrings(
        rows.flatMap((row) => Object.keys(row || {})),
    );

    const textColumns = [];
    const numericColumns = [];

    for (const column of allColumns) {
        const values = rows
            .map((row) => row?.[column])
            .filter((value) => value !== null && value !== undefined);

        const hasNumericValue = values.some(
            (value) => typeof value === "number" && Number.isFinite(value),
        );
        const hasStringValue = values.some(
            (value) => typeof value === "string" && sanitizeText(value).length > 0,
        );

        if (hasNumericValue) {
            numericColumns.push(column);
            continue;
        }

        if (hasStringValue) {
            textColumns.push(column);
        }
    }

    const searchableTextColumns = textColumns.filter((column) => !isMetadataColumn(column));
    const filterableTextColumns = searchableTextColumns.filter((column) => column !== "title");
    const distinctTextValuesByColumn = Object.fromEntries(
        filterableTextColumns.map((column) => [
            column,
            dedupeStrings(
                rows
                    .map((row) => normalizeOptionalString(row?.[column]))
                    .filter(Boolean),
            ),
        ]),
    );

    return {
        allColumns,
        textColumns,
        numericColumns,
        searchableTextColumns,
        filterableTextColumns,
        distinctTextValuesByColumn,
    };
}

async function loadCarsInventory() {
    const now = Date.now();

    if (cachedCarsInventory && now - cachedCarsInventoryAt < CARS_INVENTORY_TTL_MS) {
        return cachedCarsInventory;
    }

    if (carsInventoryPromise) {
        return carsInventoryPromise;
    }

    carsInventoryPromise = fetchAllCarsFromSupabase()
        .then((cars) => {
            cachedCarsInventory = cars;
            cachedCarsInventoryAt = Date.now();
            cachedCarsSearchProfile = inferCarsSearchProfile(cachedCarsInventory);
            cachedCarsSearchProfileAt = Date.now();

            return cachedCarsInventory;
        })
        .catch(() => {
            cachedCarsInventory = [];
            cachedCarsInventoryAt = Date.now();
            cachedCarsSearchProfile = getEmptyCarsSearchProfile();
            cachedCarsSearchProfileAt = Date.now();

            return cachedCarsInventory;
        })
        .finally(() => {
            carsInventoryPromise = null;
        });

    return carsInventoryPromise;
}

async function fetchAllCarsFromSupabase() {
    const allCars = [];
    let from = 0;

    while (true) {
        const to = from + INVENTORY_PAGE_SIZE - 1;
        const { data, error } = await supabaseAdmin
            .from("cars")
            .select("*")
            .order("id", { ascending: true })
            .range(from, to);

        if (error) {
            throw error;
        }

        const batch = Array.isArray(data) ? data : [];
        allCars.push(...batch);

        if (batch.length < INVENTORY_PAGE_SIZE) {
            break;
        }

        from += INVENTORY_PAGE_SIZE;
    }

    return allCars;
}

async function loadCarsSearchProfile() {
    const now = Date.now();

    if (cachedCarsSearchProfile && now - cachedCarsSearchProfileAt < SEARCH_PROFILE_TTL_MS) {
        return cachedCarsSearchProfile;
    }

    if (carsSearchProfilePromise) {
        return carsSearchProfilePromise;
    }

    carsSearchProfilePromise = loadCarsInventory()
        .then((cars) => {
            if (!Array.isArray(cars) || cars.length === 0) {
                cachedCarsSearchProfile = getEmptyCarsSearchProfile();
            } else {
                cachedCarsSearchProfile = inferCarsSearchProfile(cars);
            }

            cachedCarsSearchProfileAt = Date.now();
            return cachedCarsSearchProfile;
        })
        .finally(() => {
            carsSearchProfilePromise = null;
        });

    return carsSearchProfilePromise;
}

function normalizeExactFilters(rawExactFilters, profile) {
    if (!rawExactFilters || typeof rawExactFilters !== "object" || Array.isArray(rawExactFilters)) {
        return {};
    }

    const numericColumns = new Set(profile?.numericColumns || []);
    const textColumns = new Set(profile?.filterableTextColumns || []);
    const normalized = {};

    for (const [column, rawValue] of Object.entries(rawExactFilters)) {
        if (numericColumns.has(column)) {
            const value = normalizeOptionalNumber(rawValue);
            if (value !== null) {
                normalized[column] = value;
            }
            continue;
        }

        if (textColumns.has(column)) {
            if (Array.isArray(rawValue)) {
                const values = rawValue
                    .map(normalizeOptionalString)
                    .filter(Boolean);

                if (values.length === 1) {
                    normalized[column] = values[0];
                } else if (values.length > 1) {
                    normalized[column] = dedupeStrings(values);
                }
                continue;
            }

            const value = normalizeOptionalString(rawValue);
            if (value) {
                normalized[column] = value;
            }
        }
    }

    return normalized;
}

function normalizeSingleRange(rawRange) {
    if (!rawRange || typeof rawRange !== "object" || Array.isArray(rawRange)) {
        return null;
    }

    const min = normalizeOptionalNumber(
        rawRange.min ??
        rawRange.from ??
        rawRange.gte ??
        rawRange.start,
    );
    const max = normalizeOptionalNumber(
        rawRange.max ??
        rawRange.to ??
        rawRange.lte ??
        rawRange.end,
    );

    if (min === null && max === null) {
        return null;
    }

    return { min, max };
}

function normalizeRangeFilters(rawRangeFilters, profile) {
    if (!rawRangeFilters || typeof rawRangeFilters !== "object" || Array.isArray(rawRangeFilters)) {
        return {};
    }

    const numericColumns = new Set(profile?.numericColumns || []);
    const normalized = {};

    for (const [column, rawValue] of Object.entries(rawRangeFilters)) {
        if (!numericColumns.has(column)) {
            continue;
        }

        const range = normalizeSingleRange(rawValue);
        if (range) {
            normalized[column] = range;
        }
    }

    return normalized;
}

function normalizeLegacyFilters(rawFilters = {}, profile) {
    const exactFilters = {};
    const rangeFilters = {};

    const legacyExactEntries = [
        ["brand", rawFilters.brand],
        ["model", rawFilters.model],
        ["fuel", rawFilters.fuel],
    ];
    const legacyRangeEntries = [
        ["price", { min: rawFilters.minPrice, max: rawFilters.maxPrice }],
        ["year", { min: rawFilters.minYear, max: rawFilters.maxYear }],
        ["mileage", { min: rawFilters.minMileage, max: rawFilters.maxMileage }],
    ];

    const textColumns = new Set(profile?.filterableTextColumns || []);
    const numericColumns = new Set(profile?.numericColumns || []);

    for (const [column, rawValue] of legacyExactEntries) {
        if (!textColumns.has(column)) {
            continue;
        }

        const value = normalizeOptionalString(rawValue);
        if (value) {
            exactFilters[column] = value;
        }
    }

    for (const [column, rawValue] of legacyRangeEntries) {
        if (!numericColumns.has(column)) {
            continue;
        }

        const range = normalizeSingleRange(rawValue);
        if (range) {
            rangeFilters[column] = range;
        }
    }

    return { exactFilters, rangeFilters };
}

function normalizeAnalysis(raw, fallbackSearchText = "", profile = getEmptyCarsSearchProfile()) {
    const extraTerms = Array.isArray(raw?.extraTerms)
        ? raw.extraTerms.map(normalizeOptionalString).filter(Boolean)
        : [];
    const deterministic = inferDeterministicFilters(fallbackSearchText, profile);
    const deterministicRanges = inferGenericDeterministicRanges(fallbackSearchText, profile);

    const legacy = normalizeLegacyFilters(
        raw?.filters && typeof raw.filters === "object" ? raw.filters : {},
        profile,
    );
    const exactFilters = {
        ...legacy.exactFilters,
        ...normalizeExactFilters(raw?.exactFilters, profile),
        ...deterministic.exactFilters,
    };
    const rangeFilters = {
        ...legacy.rangeFilters,
        ...normalizeRangeFilters(raw?.rangeFilters, profile),
        ...deterministicRanges,
    };
    const alternativeFilterGroups = inferAlternativeFilterGroups(fallbackSearchText, profile);

    return {
        intent: normalizeIntent(raw?.intent),
        exactFilters,
        rangeFilters,
        alternativeFilterGroups,
        searchText: normalizeOptionalString(raw?.searchText) || normalizeOptionalString(fallbackSearchText),
        extraTerms: dedupeStrings(extraTerms),
    };
}

function resolveTextFilterValue(column, value, rawMessage, profile) {
    const candidates = profile?.distinctTextValuesByColumn?.[column] || [];

    if (typeof value !== "string" || !value || candidates.length === 0) {
        return value;
    }

    const valueSignatures = buildSemanticSignatureSet(value);
    const messageSignatures = buildSemanticSignatureSet(rawMessage);
    let bestCandidate = value;
    let bestScore = 0;

    for (const candidate of candidates) {
        const candidateSignatures = buildSemanticSignatureSet(candidate);
        const score =
            countSemanticSetOverlap(candidateSignatures, valueSignatures) * 3 +
            countSemanticSetOverlap(candidateSignatures, messageSignatures);

        if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    }

    return bestScore > 0 ? bestCandidate : value;
}

function resolveAnalysisWithProfile(analysis, rawMessage, profile) {
    const resolvedExactFilters = {};

    for (const [column, value] of Object.entries(analysis?.exactFilters || {})) {
        if (Array.isArray(value)) {
            resolvedExactFilters[column] = dedupeStrings(
                value.map((item) => (
                    typeof item === "string"
                        ? resolveTextFilterValue(column, item, rawMessage, profile)
                        : item
                )),
            );
            continue;
        }

        if (typeof value === "string") {
            resolvedExactFilters[column] = resolveTextFilterValue(column, value, rawMessage, profile);
            continue;
        }

        resolvedExactFilters[column] = value;
    }

    return {
        ...analysis,
        exactFilters: resolvedExactFilters,
        alternativeFilterGroups: (analysis?.alternativeFilterGroups || []).map((group) => {
            const resolvedGroupExactFilters = {};

            for (const [column, value] of Object.entries(group?.exactFilters || {})) {
                resolvedGroupExactFilters[column] = typeof value === "string"
                    ? resolveTextFilterValue(column, value, rawMessage, profile)
                    : value;
            }

            return {
                ...group,
                exactFilters: resolvedGroupExactFilters,
            };
        }),
    };
}

function isSearchTokenUseful(token, structuredFiltersPresent = false) {
    const signature = normalizeSearchTokenSignature(token);

    if (signature.length < 2 || GENERIC_SEARCH_STOPWORD_SIGNATURES.has(signature)) {
        return false;
    }

    if (structuredFiltersPresent && /^\d+$/.test(signature)) {
        return false;
    }

    return true;
}

function tokenizeSearchText(value = "", { structuredFiltersPresent = false, allowPhrase = true } = {}) {
    const normalized = sanitizeText(value).toLowerCase();

    if (!normalized) {
        return [];
    }

    const rawTokens = splitTextIntoRawTokens(normalized);
    const tokens = rawTokens.filter((token) => isSearchTokenUseful(token, structuredFiltersPresent));

    const terms = [];

    if (allowPhrase && rawTokens.length > 0 && rawTokens.length <= SEARCH_PHRASE_MAX_TOKENS && tokens.length > 0) {
        terms.push(normalized);
    }

    terms.push(...tokens);

    return dedupeStrings(terms);
}

function getStructuredFilterSignatures(analysis) {
    const exactFilters = analysis?.exactFilters || {};
    const signatures = new Set();

    for (const value of Object.values(exactFilters)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item !== "string") {
                    continue;
                }

                for (const signature of buildSemanticSignatureSet(item)) {
                    signatures.add(signature);
                }
            }
            continue;
        }

        if (typeof value !== "string") {
            continue;
        }

        for (const signature of buildSemanticSignatureSet(value)) {
            signatures.add(signature);
        }
    }

    for (const group of analysis?.alternativeFilterGroups || []) {
        for (const value of Object.values(group?.exactFilters || {})) {
            if (typeof value !== "string") {
                continue;
            }

            for (const signature of buildSemanticSignatureSet(value)) {
                signatures.add(signature);
            }
        }
    }

    return signatures;
}

function getEffectiveTextTerms(analysis, rawMessage = "") {
    const structuredFiltersPresent = hasStructuredFilters(analysis);
    const candidateTerms = [];

    for (const value of [
        analysis?.searchText,
        ...(analysis?.extraTerms || []),
    ]) {
        candidateTerms.push(...tokenizeSearchText(value, {
            structuredFiltersPresent,
            allowPhrase: !structuredFiltersPresent,
        }));
    }

    if (candidateTerms.length === 0 && !structuredFiltersPresent) {
        candidateTerms.push(...tokenizeSearchText(rawMessage, {
            structuredFiltersPresent: false,
            allowPhrase: true,
        }));
    }

    const structuredSignatures = getStructuredFilterSignatures(analysis);

    const termsWithoutStructuredValues = dedupeStrings(candidateTerms).filter((term) => {
        const termSignatures = buildSemanticSignatureSet(term);
        return !semanticSetsOverlap(termSignatures, structuredSignatures);
    });

    return removeStructuredFilterNoise(analysis, termsWithoutStructuredValues);
}

function getEffectiveSearchFragments(analysis, rawMessage = "") {
    return dedupeStrings(
        getEffectiveTextTerms(analysis, rawMessage).flatMap((term) => buildSearchFragments(term)),
    );
}

function buildOrClause(terms = [], profile = getEmptyCarsSearchProfile()) {
    const safeTerms = dedupeStrings(
        terms.flatMap((term) => buildSearchFragments(term)),
    );
    const searchableColumns = profile?.searchableTextColumns || [];

    if (safeTerms.length === 0 || searchableColumns.length === 0) {
        return null;
    }

    const clauses = [];

    for (const term of safeTerms) {
        for (const column of searchableColumns) {
            clauses.push(`${column}.ilike.%${term}%`);
        }
    }

    return clauses.join(",");
}

function hasStructuredFilters(analysis) {
    return Object.keys(analysis?.exactFilters || {}).length > 0 ||
        Object.keys(analysis?.rangeFilters || {}).length > 0 ||
        (analysis?.alternativeFilterGroups || []).length > 0;
}

function normalizeComparableValue(value) {
    if (typeof value !== "string") {
        return "";
    }

    return stripDiacritics(sanitizeText(value).toLowerCase());
}

function matchesTextFilter(actualValue, expectedValue) {
    if (Array.isArray(expectedValue)) {
        return expectedValue.some((value) => matchesTextFilter(actualValue, value));
    }

    const comparableValue = normalizeComparableValue(actualValue);
    const fragments = buildSearchFragments(expectedValue);

    if (!comparableValue || fragments.length === 0) {
        return false;
    }

    return fragments.every((fragment) => comparableValue.includes(fragment));
}

function getSafeNumericValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    return normalizeOptionalNumber(value);
}

function getCarRelevanceScore(car, analysis, profile, rawMessage = "", searchFragments = null) {
    const searchableColumns = profile?.searchableTextColumns || [];
    const comparableTextValues = Object.fromEntries(
        searchableColumns.map((column) => [column, normalizeComparableValue(car?.[column])]),
    );
    const effectiveSearchFragments = Array.isArray(searchFragments)
        ? searchFragments
        : getEffectiveSearchFragments(analysis, rawMessage);

    let score = 0;

    for (const [column, expectedValue] of Object.entries(analysis?.exactFilters || {})) {
        if (typeof expectedValue === "number") {
            if (getSafeNumericValue(car?.[column]) === expectedValue) {
                score += 40;
            }
            continue;
        }

        if (Array.isArray(expectedValue)) {
            if (expectedValue.some((value) => matchesTextFilter(comparableTextValues[column] || "", value))) {
                score += 40;
            }
            continue;
        }

        const actualValue = comparableTextValues[column] || "";
        if (matchesTextFilter(actualValue, expectedValue)) {
            score += 40;
        }
    }

    for (const term of effectiveSearchFragments) {
        let matches = 0;

        for (const value of Object.values(comparableTextValues)) {
            if (value && value.includes(term)) {
                matches += 1;
            }
        }

        if (matches > 0) {
            score += 10 + (matches - 1) * 2;

            if (comparableTextValues.title && comparableTextValues.title.includes(term)) {
                score += 4;
            }
        }
    }

    return score;
}

function compareCarsFallback(a, b) {
    const yearA = getSafeNumericValue(a?.year) ?? Number.NEGATIVE_INFINITY;
    const yearB = getSafeNumericValue(b?.year) ?? Number.NEGATIVE_INFINITY;

    if (yearA !== yearB) {
        return yearB - yearA;
    }

    const priceA = getSafeNumericValue(a?.price) ?? Number.POSITIVE_INFINITY;
    const priceB = getSafeNumericValue(b?.price) ?? Number.POSITIVE_INFINITY;

    if (priceA !== priceB) {
        return priceA - priceB;
    }

    return 0;
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

function formatColumnLabel(column) {
    return COLUMN_LABELS_PT[column] || formatLabel(String(column).replace(/_/g, " "));
}

function getDisplayTextTerms(analysis, rawMessage = "") {
    return getEffectiveTextTerms(analysis, rawMessage);
}

export async function getCarsSearchProfile() {
    return loadCarsSearchProfile();
}

export async function analyzeUserQuery(message, profile = null) {
    const effectiveProfile = profile || await loadCarsSearchProfile();
    const cachedAnalysis = getCachedAnalysis(message);

    if (cachedAnalysis) {
        return cachedAnalysis;
    }

    try {
        const parsed = await analyzeQueryWithLlm(message, effectiveProfile);

        if (!parsed || typeof parsed !== "object") {
            const resolvedAnalysis = resolveAnalysisWithProfile(
                normalizeAnalysis({ intent: "unknown" }, message, effectiveProfile),
                message,
                effectiveProfile,
            );
            setCachedAnalysis(message, resolvedAnalysis);
            return resolvedAnalysis;
        }

        const resolvedAnalysis = resolveAnalysisWithProfile(
            normalizeAnalysis(parsed, message, effectiveProfile),
            message,
            effectiveProfile,
        );
        setCachedAnalysis(message, resolvedAnalysis);
        return resolvedAnalysis;
    } catch {
        const resolvedAnalysis = resolveAnalysisWithProfile(
            normalizeAnalysis({ intent: "unknown" }, message, effectiveProfile),
            message,
            effectiveProfile,
        );
        setCachedAnalysis(message, resolvedAnalysis);
        return resolvedAnalysis;
    }
}

export function applyCarFilters(query, analysis, profile, rawMessage = "") {
    let nextQuery = query;
    const numericColumns = new Set(profile?.numericColumns || []);
    const textColumns = new Set(profile?.filterableTextColumns || []);

    for (const [column, value] of Object.entries(analysis?.exactFilters || {})) {
        if (numericColumns.has(column) && typeof value === "number") {
            nextQuery = nextQuery.eq(column, value);
            continue;
        }

        if (textColumns.has(column) && typeof value === "string") {
            const fragments = buildSearchFragments(value);

            for (const fragment of fragments) {
                nextQuery = nextQuery.ilike(column, `%${fragment}%`);
            }
            continue;
        }

        if (textColumns.has(column) && Array.isArray(value)) {
            const clauses = value.flatMap((item) =>
                buildSearchFragments(item).map((fragment) => `${column}.ilike.%${fragment}%`),
            );

            if (clauses.length > 0) {
                nextQuery = nextQuery.or(clauses.join(","));
            }
        }
    }

    for (const [column, range] of Object.entries(analysis?.rangeFilters || {})) {
        if (!numericColumns.has(column) || !range || typeof range !== "object") {
            continue;
        }

        if (range.min !== null && range.min !== undefined) {
            nextQuery = nextQuery.gte(column, range.min);
        }

        if (range.max !== null && range.max !== undefined) {
            nextQuery = nextQuery.lte(column, range.max);
        }
    }

    const orClause = buildOrClause(getEffectiveTextTerms(analysis, rawMessage), profile);

    if (orClause) {
        nextQuery = nextQuery.or(orClause);
    }

    return nextQuery;
}

function hasAlternativeFilterGroups(analysis) {
    return Array.isArray(analysis?.alternativeFilterGroups) &&
        analysis.alternativeFilterGroups.length > 0;
}

export function finalizeCarSearchResults(
    cars = [],
    analysis,
    profile,
    rawMessage = "",
) {
    if (!Array.isArray(cars) || cars.length === 0) {
        return [];
    }

    const effectiveSearchFragments = getEffectiveSearchFragments(analysis, rawMessage);
    const shouldRankByRelevance = hasStructuredFilters(analysis) ||
        effectiveSearchFragments.length > 0;

    const rankedCars = cars
        .map((car, index) => ({
            car,
            index,
            score: shouldRankByRelevance
                ? getCarRelevanceScore(car, analysis, profile, rawMessage, effectiveSearchFragments)
                : 0,
        }))
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            const fallback = compareCarsFallback(left.car, right.car);
            if (fallback !== 0) {
                return fallback;
            }

            return left.index - right.index;
        });

    return rankedCars.map(({ car }) => car);
}

export function isCarSearchIntent(analysis) {
    if (analysis?.intent === "car_search") {
        return true;
    }

    if (analysis?.intent === "technical_question") {
        return false;
    }

    return false;
}

export function buildCarsReply(analysis, cars, rawMessage = "", totalCars = null) {
    const activeFilters = [];

    if (hasAlternativeFilterGroups(analysis)) {
        const groups = analysis.alternativeFilterGroups
            .map((group) => Object.entries(group?.exactFilters || {})
                .map(([column, value]) => `${formatColumnLabel(column)} ${formatLabel(value)}`)
                .join(" "))
            .filter(Boolean);

        if (groups.length > 0) {
            activeFilters.push(groups.join(" ou "));
        }
    }

    if (!hasAlternativeFilterGroups(analysis)) {
        for (const [column, value] of Object.entries(analysis?.exactFilters || {})) {
            if (typeof value === "number") {
                activeFilters.push(`${formatColumnLabel(column)} ${value}`);
                continue;
            }

            if (Array.isArray(value)) {
                activeFilters.push(`${formatColumnLabel(column)} ${value.map(formatLabel).join(" ou ")}`);
                continue;
            }

            if (typeof value === "string") {
                activeFilters.push(`${formatColumnLabel(column)} ${formatLabel(value)}`);
            }
        }
    }

    for (const [column, range] of Object.entries(analysis?.rangeFilters || {})) {
        if (!range || typeof range !== "object") {
            continue;
        }

        if (range.min !== null && range.min !== undefined && range.max !== null && range.max !== undefined) {
            activeFilters.push(`${formatColumnLabel(column)} entre ${range.min} e ${range.max}`);
            continue;
        }

        if (range.min !== null && range.min !== undefined) {
            activeFilters.push(`${formatColumnLabel(column)} desde ${range.min}`);
        }

        if (range.max !== null && range.max !== undefined) {
            activeFilters.push(`${formatColumnLabel(column)} ate ${range.max}`);
        }
    }

    const displayTextTerms = getDisplayTextTerms(analysis, rawMessage);
    if (displayTextTerms.length > 0) {
        activeFilters.push(`termos "${displayTextTerms.join(", ")}"`);
    }

    if (!cars.length) {
        const context = activeFilters.length > 0
            ? ` com ${activeFilters.join(", ")}`
            : "";

        return `Nao encontrei carros${context}. Ajusta a pesquisa e tenta novamente.`;
    }

    const totalMatches = Number.isFinite(totalCars) ? totalCars : cars.length;
    const intro = activeFilters.length > 0
        ? `Encontrei ${totalMatches} carros com ${activeFilters.join(", ")}.`
        : `Encontrei ${totalMatches} carros relevantes.`;
    const shouldCompactReply = cars.length > MAX_REPLY_LIST_ITEMS;

    const lines = cars.slice(0, MAX_REPLY_LIST_ITEMS).map((car, index) => {
        const details = [
            car.year ?? "ano n/d",
            car.fuel || null,
            car.transmission || null,
        ].filter(Boolean);

        return `${index + 1}. ${car.title} - ${details.join(" - ")} - ${formatPrice(car.price)}`;
    });

    return [
        intro,
        ...(shouldCompactReply
            ? ["", `A lista completa com os ${cars.length} anuncios segue nos cards abaixo.`]
            : ["", ...lines]),
        "",
        "Os cards abaixo mostram imagem e link direto para cada anuncio.",
    ].join("\n");
}
