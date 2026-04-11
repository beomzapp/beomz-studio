"""
Beomz Studio SLM sidecar — FastAPI application.

Exposes:
  GET  /health               → {"status": "ok", "model": "..."}
  POST /match-template       → ranked template IDs with confidence scores
  POST /classify-palette     → best palette name + confidence

The model is loaded once at startup and shared between modules.
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

import matcher
import palette

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("slm")

MODEL_NAME = os.environ.get("SLM_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    log.info("Loading embedding model: %s", MODEL_NAME)
    model = SentenceTransformer(MODEL_NAME)
    log.info("Model loaded. Pre-computing palette embeddings…")
    matcher.load_model(model)
    palette.load_model(model)
    log.info("SLM service ready.")
    yield
    log.info("SLM service shutting down.")


app = FastAPI(title="beomz-slm", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class TemplateDescriptor(BaseModel):
    id: str
    description: str = ""
    tags: list[str] = []


class MatchTemplateRequest(BaseModel):
    prompt: str
    templates: list[TemplateDescriptor]


class MatchResult(BaseModel):
    templateId: str
    confidence: float


class ClassifyPaletteRequest(BaseModel):
    prompt: str
    template_id: str = ""


class PaletteResult(BaseModel):
    palette: str
    confidence: float


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/match-template", response_model=list[MatchResult])
def match_template(body: MatchTemplateRequest) -> list[dict]:
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt must not be empty")
    template_dicts = [t.model_dump() for t in body.templates]
    return matcher.match(body.prompt, template_dicts)


@app.post("/classify-palette", response_model=PaletteResult)
def classify_palette(body: ClassifyPaletteRequest) -> dict:
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt must not be empty")
    return palette.classify(body.prompt, body.template_id)
