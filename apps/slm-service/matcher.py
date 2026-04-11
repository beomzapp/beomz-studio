"""
Template matcher for Beomz Studio SLM sidecar.

Accepts a user prompt and a list of template descriptors, returns them
ranked by cosine similarity.  Template embeddings are cached in-process
keyed by template ID so repeated calls for the same template set are free.
"""

import hashlib
import numpy as np
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_model: SentenceTransformer | None = None

# Cache: template_id → (text_hash, embedding)
# The text_hash guards against a template's description changing between
# deployments while keeping the same ID.
_embedding_cache: dict[str, tuple[str, np.ndarray]] = {}


def load_model(model: SentenceTransformer) -> None:
    """Receive the shared model instance from main.py."""
    global _model
    _model = model


def _template_text(template: dict) -> str:
    """Compose a single string that represents the template for embedding."""
    parts: list[str] = []
    if template.get("description"):
        parts.append(template["description"])
    tags = template.get("tags") or []
    if tags:
        parts.append(" ".join(tags))
    return " ".join(parts)


def _text_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def match(prompt: str, templates: list[dict]) -> list[dict]:
    """
    Rank templates by semantic similarity to the prompt.

    Args:
        prompt:    The user's build prompt (possibly augmented with plan text).
        templates: List of dicts with at least {"id": str}.
                   Optional keys: "description", "tags" (list[str]).

    Returns:
        List of {"templateId": str, "confidence": float} sorted descending.
    """
    if _model is None or not templates:
        return [{"templateId": t["id"], "confidence": 0.0} for t in templates]

    # Embed the prompt (normalised for cosine via dot product)
    prompt_embedding: np.ndarray = _model.encode(
        prompt, convert_to_numpy=True, normalize_embeddings=True
    )

    results: list[dict] = []

    for template in templates:
        template_id: str = template.get("id", "")
        if not template_id:
            continue

        text = _template_text(template)
        t_hash = _text_hash(text)

        cached = _embedding_cache.get(template_id)
        if cached is None or cached[0] != t_hash:
            emb: np.ndarray = _model.encode(
                text, convert_to_numpy=True, normalize_embeddings=True
            )
            _embedding_cache[template_id] = (t_hash, emb)

        template_emb = _embedding_cache[template_id][1]
        score = float(np.dot(prompt_embedding, template_emb))
        results.append({"templateId": template_id, "confidence": round(score, 4)})

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results
