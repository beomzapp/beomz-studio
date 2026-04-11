"""
Palette classifier for Beomz Studio SLM sidecar.

Scores a user prompt against 20 palette descriptions using cosine
similarity on sentence embeddings. Palette embeddings are pre-computed
once at startup and cached for the process lifetime.
"""

import numpy as np
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Palette catalogue
# Each value is a natural-language description used for embedding.
# Keep these aligned with the palette IDs in generateFiles.ts.
# ---------------------------------------------------------------------------

PALETTE_DESCRIPTIONS: dict[str, str] = {
    "crypto-dark": (
        "cryptocurrency blockchain defi wallet web3 token nft digital assets "
        "trading dark theme crypto finance"
    ),
    "law-navy": (
        "legal law attorney compliance firm contracts corporate governance "
        "professional navy formal"
    ),
    "finance-green": (
        "personal finance budget money expense accounting invoice tax "
        "bookkeeping savings tracking green"
    ),
    "medical-blue": (
        "medical clinic doctor hospital patient healthcare therapy dental "
        "clinical health professional blue"
    ),
    "energy-red": (
        "workout gym fitness sport training athlete running performance "
        "exercise energy red active"
    ),
    "health-teal": (
        "health wellness habits nutrition mindfulness yoga meditation "
        "self-care teal calm lifestyle"
    ),
    "warm-amber": (
        "food restaurant recipe cooking cafe coffee dining menu bakery "
        "hospitality amber warm food"
    ),
    "kids-yellow": (
        "kids children school classroom education toddler fun learning "
        "games bright yellow playful"
    ),
    "midnight-indigo": (
        "productivity study planner focus notes todo task calendar "
        "scheduling indigo midnight dark clean"
    ),
    "retail-coral": (
        "retail shopping store ecommerce commerce deals products checkout "
        "cart coral sales"
    ),
    "rose-pink": (
        "beauty fashion skincare cosmetics lifestyle makeup glamour "
        "pink rose feminine"
    ),
    "ocean-cyan": (
        "travel water ocean beach hotel flight cruise vacation "
        "tourism cyan blue"
    ),
    "nature-emerald": (
        "nature plant garden eco sustainability green meditation "
        "environment emerald organic"
    ),
    "gaming-neon": (
        "gaming game esports streaming arcade entertainment neon "
        "dark vibrant gamer"
    ),
    "creative-purple": (
        "creative design art artist agency portfolio brand studio "
        "purple vibrant visual"
    ),
    "startup-violet": (
        "startup founder launch modern saas pitch venture capital "
        "violet product growth"
    ),
    "professional-blue": (
        "business saas corporate crm dashboard workspace enterprise b2b "
        "professional blue serious"
    ),
    "news-charcoal": (
        "news blog article editorial publishing magazine media content "
        "journalism charcoal"
    ),
    "slate-neutral": (
        "minimal notes documentation wiki knowledge base clean simple "
        "neutral slate muted"
    ),
    "warm-orange": (
        "tool utility app interactive general purpose calculator converter "
        "orange versatile default"
    ),
}

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_model: SentenceTransformer | None = None
_palette_embeddings: dict[str, np.ndarray] = {}


def load_model(model: SentenceTransformer) -> None:
    """
    Receive the shared model instance from main.py and pre-compute
    all palette embeddings.
    """
    global _model, _palette_embeddings
    _model = model

    texts = list(PALETTE_DESCRIPTIONS.values())
    palette_ids = list(PALETTE_DESCRIPTIONS.keys())
    embeddings = _model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)

    _palette_embeddings = {
        palette_id: embeddings[i]
        for i, palette_id in enumerate(palette_ids)
    }


def classify(prompt: str, template_id: str = "") -> dict:
    """
    Return the best-matching palette name and confidence score for a prompt.

    Falls back to a deterministic default when the model is not loaded.
    """
    if _model is None or not _palette_embeddings:
        return {"palette": "warm-orange", "confidence": 0.0}

    prompt_embedding = _model.encode(
        prompt, convert_to_numpy=True, normalize_embeddings=True
    )

    best_palette = "warm-orange"
    best_score = -1.0

    for palette_id, palette_emb in _palette_embeddings.items():
        score = float(np.dot(prompt_embedding, palette_emb))
        if score > best_score:
            best_score = score
            best_palette = palette_id

    return {"palette": best_palette, "confidence": round(best_score, 4)}
