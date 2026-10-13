import json
import hashlib
import math
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
KNOWLEDGE = json.loads((Path(__file__).with_name("knowledge.json")).read_text(encoding="utf-8"))

STOP_WORDS = {"a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "i", "in", "is", "it", "my", "of", "on", "or", "the", "to", "we", "with"}


def vectorize(text: str) -> Counter[str]:
    tokens = [token for token in re.findall(r"[a-z0-9]+", text.lower()) if token not in STOP_WORDS]
    return Counter(tokens)


def cosine(left: Counter[str], right: Counter[str]) -> float:
    shared = left.keys() & right.keys()
    numerator = sum(left[token] * right[token] for token in shared)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    return numerator / (left_norm * right_norm) if left_norm and right_norm else 0.0


def dense_embedding(text: str, dimensions: int = 384) -> list[float]:
    vector = [0.0] * dimensions
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    features = tokens + [f"{left}_{right}" for left, right in zip(tokens, tokens[1:])]
    for feature in features:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "little")
        vector[value % dimensions] += 1.0 if value & (1 << 63) else -1.0
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


async def huggingface_embedding(text: str) -> list[float] | None:
    token = os.getenv("HUGGINGFACE_API_TOKEN")
    if not token:
        return None
    model = os.getenv("HUGGINGFACE_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                f"https://router.huggingface.co/hf-inference/models/{model}",
                headers={"Authorization": f"Bearer {token}"},
                json={"inputs": text},
            )
            response.raise_for_status()
            values = response.json()
        if isinstance(values, dict):
            values = values.get("embeddings", values.get("feature_extraction", []))
        if values and isinstance(values[0], list) and values[0] and isinstance(values[0][0], list):
            values = values[0]
        if values and isinstance(values[0], list):
            vectors = values
            embedding = [sum(row[index] for row in vectors) / len(vectors) for index in range(len(vectors[0]))]
        else:
            embedding = values
        if not embedding or not all(isinstance(value, (int, float)) for value in embedding):
            return None
        norm = math.sqrt(sum(value * value for value in embedding))
        return [float(value) / norm for value in embedding] if norm else None
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError):
        return None


class LocalVectorIndex:
    """Small cosine-similarity index used when Atlas Vector Search is unavailable."""

    def __init__(self, documents: list[dict[str, Any]]):
        self.documents = documents
        self.vectors = [vectorize(f"{doc['title']} {doc['category']} {' '.join(doc['tags'])} {doc['content']}") for doc in documents]

    def search(self, query: str, limit: int = 3) -> list[dict[str, Any]]:
        query_vector = vectorize(query)
        scored = [(cosine(query_vector, vector), document) for vector, document in zip(self.vectors, self.documents)]
        return [dict(document, score=round(score, 3)) for score, document in sorted(scored, key=lambda item: item[0], reverse=True)[:limit] if score > 0]


vector_index = LocalVectorIndex(KNOWLEDGE)


def classify_request(text: str) -> dict[str, str | int]:
    message = text.lower()
    if any(word in message for word in ("install", "provision", "software", "vscode", "visual studio code", "license")):
        return {"intent": "Software Request", "category": "Software / Access", "priority": "P3", "impact": "Individual", "urgency": "Medium", "assignment_group": "Software Support"}
    if any(word in message for word in ("password", "locked out", "account locked", "unlock", "sign in", "login")):
        return {"intent": "Incident", "category": "Account access", "priority": "P2", "impact": "Individual", "urgency": "High", "assignment_group": "Identity and Access Support"}
    if any(word in message for word in ("vpn", "wi-fi", "wifi", "network", "internet", "connection")):
        return {"intent": "Incident", "category": "Network / VPN", "priority": "P2", "impact": "Individual", "urgency": "High", "assignment_group": "Network Support"}
    if any(word in message for word in ("outlook", "email", "mailbox", "sync")):
        return {"intent": "Incident", "category": "Email / Outlook", "priority": "P3", "impact": "Individual", "urgency": "Medium", "assignment_group": "Collaboration Support"}
    if any(word in message for word in ("slow", "laptop", "performance", "restart")):
        return {"intent": "Incident", "category": "Endpoint", "priority": "P3", "impact": "Individual", "urgency": "Medium", "assignment_group": "Endpoint Support"}
    return {"intent": "Service Request", "category": "General IT Support", "priority": "P3", "impact": "Individual", "urgency": "Medium", "assignment_group": "Service Desk"}


async def generate_grounded_answer(question: str, sources: list[dict[str, Any]]) -> tuple[str, str]:
    token = os.getenv("HUGGINGFACE_API_TOKEN")
    model = os.getenv("HUGGINGFACE_MODEL", "Qwen/Qwen2.5-7B-Instruct")
    context = "\n".join(f"[{source['id']}] {source['title']}: {source['content']}" for source in sources)
    if token and sources:
        prompt = f"Answer using only this approved IT knowledge. If it does not contain the answer, say you do not know and recommend escalation. Cite article IDs.\n\nKnowledge:\n{context}\n\nQuestion: {question}"
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.post(
                    "https://router.huggingface.co/v1/chat/completions",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 180, "temperature": 0.2},
                )
                response.raise_for_status()
                result = response.json()
                answer = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if answer:
                    return answer, model
        except (httpx.HTTPError, ValueError, KeyError):
            pass
    if not sources or sources[0]["score"] < 0.1:
        return "I could not find a sufficiently relevant approved article. I can create a ticket and route it to the Service Desk.", "Grounded fallback"
    first = sources[0]
    return f"{first['content']} (Source: {first['id']} - {first['title']})", "Grounded fallback"
