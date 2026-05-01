from typing import Any


def serialize_columns(columns: list[str] | None) -> str:
    return ", ".join(columns or []) or "nenhuma inferida"


def serialize_promptable_distinct_values(profile: dict[str, Any]) -> str:
    values_by_column = profile.get("distinctTextValuesByColumn") or {}
    lines = []

    if isinstance(values_by_column, dict):
        for column, values in values_by_column.items():
            if isinstance(values, list) and 0 < len(values) <= 20:
                lines.append(f"  - {column}: {' | '.join(str(value) for value in values)}")

    return "\n".join(lines) if lines else "  - sem valores categoricos resumidos"


def build_analysis_prompt(message: str, profile: dict[str, Any]) -> str:
    return f"""
Analisa a mensagem de um utilizador de uma plataforma automovel e devolve apenas JSON valido.

Contexto:
- A tabela cars tem estas colunas textuais pesquisaveis: {serialize_columns(profile.get("searchableTextColumns"))}.
- As colunas textuais/categoricas mais adequadas para filtros exatos sao: {serialize_columns(profile.get("filterableTextColumns"))}.
- As colunas numericas para igualdade ou intervalos sao: {serialize_columns(profile.get("numericColumns"))}.
- Valores reais conhecidos para colunas categoricas com poucos valores:
{serialize_promptable_distinct_values(profile)}
- "car_search" significa que o utilizador quer encontrar carros do inventario real da plataforma.
- "technical_question" significa duvidas de manutencao, avarias, manuais, luzes, problemas ou explicacoes tecnicas.
- "unknown" significa que a mensagem e ambigua e nao da para decidir com seguranca.

Regras:
- Usa apenas nomes de colunas reais.
- Quando houver valores reais conhecidos para uma coluna categorica, escolhe preferencialmente um desses valores nas exactFilters.
- Se o utilizador escrever o valor em portugues, plural, feminino/masculino, abreviado ou noutra variante, mapeia para o valor real mais proximo do inventario.
- Extrai filtros apenas quando estiverem explicitos ou fortemente implicitos.
- "exactFilters" e um objeto com pares coluna->valor para filtros exatos/categoricos.
- Em colunas numericas, usa "exactFilters" quando o valor for claramente exato, como "2 portas", "3 lugares" ou "5 seats".
- Usa "rangeFilters" quando o utilizador der limites, como "ate 20000", "desde 2019" ou "entre 90 e 120 cv".
- "searchText" deve conter apenas termos livres uteis para pesquisa textual e que nao estejam ja representados nos filtros.
- "extraTerms" e uma lista curta opcional para termos adicionais de pesquisa.
- Usa null quando nao houver valor.
- Nao inventes marcas, modelos, colunas ou limites numericos.

Schema:
{{
  "intent": "car_search" | "technical_question" | "unknown",
  "exactFilters": {{
    "<coluna>": "valor" | 123
  }},
  "rangeFilters": {{
    "<coluna_numerica>": {{
      "min": number | null,
      "max": number | null
    }}
  }},
  "searchText": string | null,
  "extraTerms": string[]
}}

Mensagem:
{message}
"""


def build_rag_prompt(question: str, context: str) -> str:
    return f"""
Responde em Portugues de Portugal (pt-PT), evita expressoes do portugues do Brasil.

Usa apenas a informacao do contexto.

Se o contexto tiver tabelas, interpreta os valores da tabela com cuidado.

Se houver varios modelos, carroçarias, pneus ou velocidades, explica que a resposta depende dessa variante.

Se nao souberes, diz exatamente que nao tens informacao suficiente no contexto recuperado.

Responde de forma curta e pratica, em no maximo 6 passos.

Contexto:
{context}

Pergunta:
{question}

Resposta:
"""
