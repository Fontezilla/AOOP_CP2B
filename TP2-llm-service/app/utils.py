import json
import re
from typing import Any

import numpy as np


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def extract_json_object(value: str) -> Any:
    text = normalize_whitespace(value)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1 or end <= start:
            return None

        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None


def cosine_similarity(matrix: np.ndarray, vector: np.ndarray) -> np.ndarray:
    matrix_norms = np.linalg.norm(matrix, axis=1)
    vector_norm = np.linalg.norm(vector)
    denominator = matrix_norms * vector_norm
    denominator[denominator == 0] = 1

    return np.dot(matrix, vector) / denominator
