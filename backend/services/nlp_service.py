import os
import sys
from collections import defaultdict

import joblib

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

if __package__:
    from .text_normalizer import normalize_text
    from .entity_extractor import extract_entities
    from .service_keywords import SERVICE_SYNONYMS
else:
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)

    from services.text_normalizer import normalize_text
    from services.entity_extractor import extract_entities
    from services.service_keywords import SERVICE_SYNONYMS


# =========================
# LOAD MODEL
# =========================

model = joblib.load(os.path.join(BASE_DIR, "models/model.pkl"))
vectorizer = joblib.load(os.path.join(BASE_DIR, "models/vectorizer.pkl"))

UNKNOWN_CONFIDENCE_THRESHOLD = 0.45


# =========================
# FRONTEND ROLE MAPPING
# =========================

INTENT_MAPPING = {
    "Electrical": "electrical",
    "Electrician": "electrical",
    "Plumbing": "plumbing",
    "AC Repair": "ac_repair",
    "Carpenter": "carpenter",
    "Cleaning": "cleaning",
    "Painting": "painting",
    "Gardening": "gardener",
    "Massage": "massage",
}

# =========================
# NORMALIZE INTENT
# =========================

def normalize_intent(intent: str) -> str:
    return INTENT_MAPPING.get(intent, "unknown")


# =========================
# SCORE KEYWORDS
# =========================

STOP_WORDS = {
    "in", "on", "at", "to", "the", "and", "for", "a", "an", "my", "is",
    "this", "that", "from", "by", "with", "of", "here", "there", "please",
    "need", "want", "me", "home", "house", "room", "today", "now", "near",
    "nearby", "service", "services", "help", "can", "you", "your", "our",
    "some", "someone", "urgent", "new", "old", "one", "two", "three",
    "many", "all", "any", "per", "min", "hrs", "hour", "hours",
    "got", "have", "has", "been", "do", "does", "did", "was", "were",
    "repair", "fix", "issue", "problem", "leak", "leaking", "leaks"
}


def is_meaningful_token(token: str) -> bool:
    return len(token) > 2 and token not in STOP_WORDS


def keyword_match(text_lower: str):

    scores = defaultdict(float)
    text_tokens = set(text_lower.split())

    for raw_intent, keywords in SERVICE_SYNONYMS.items():

        normalized_intent = normalize_intent(raw_intent)

        if normalized_intent == "unknown":
            continue

        for keyword in keywords:

            keyword = keyword.lower().strip()

            if not keyword:
                continue

            keyword_tokens = [token for token in keyword.split() if token]
            if not keyword_tokens:
                continue

            meaningful_tokens = [token for token in keyword_tokens if is_meaningful_token(token)]
            exact_match = keyword in text_lower
            matching_tokens = set(keyword_tokens).intersection(text_tokens)
            meaningful_matches = [token for token in meaningful_tokens if token in text_tokens]
            full_meaningful_match = meaningful_tokens and set(meaningful_tokens).issubset(text_tokens)

            if exact_match:
                word_count = len(keyword_tokens)
                weight = min(word_count + 2, 6)
                scores[normalized_intent] += weight
                continue

            if full_meaningful_match:
                word_count = len(meaningful_tokens)
                weight = min(word_count + 1, 5)
                scores[normalized_intent] += weight
                continue

            if meaningful_matches:
                ratio = len(meaningful_matches) / len(meaningful_tokens) if meaningful_tokens else 0.0
                score_boost = min(len(meaningful_matches) * 0.4 * ratio, 2.0)
                if score_boost > 0:
                    scores[normalized_intent] += score_boost

    if not scores:
        return None, 0.0

    best_intent = max(scores, key=scores.get)
    best_score = scores[best_intent]

    confidence = min(best_score / 8, 0.95)

    return best_intent, confidence


# =========================
# MAIN NLP PIPELINE
# =========================

def predict_pipeline(text: str):

    normalized = normalize_text(text)

    entities = extract_entities(normalized)

    text_lower = normalized.lower().strip()

    # =========================
    # EMPTY / GARBAGE CHECK
    # =========================

    if not text_lower:
        return {
            "intent": "unknown",
            "confidence": 0.0,
            "entities": {},
            "normalized_text": normalized
        }

    if not any(char.isalpha() for char in text_lower):
        return {
            "intent": "unknown",
            "confidence": 0.0,
            "entities": {},
            "normalized_text": normalized
        }

    # =========================
    # KEYWORD + SYNONYM MATCH
    # =========================

    matched_intent, matched_confidence = keyword_match(text_lower)

    if matched_intent and matched_confidence >= 0.40:

        print("\n========== KEYWORD MATCH ==========")
        print(f"[INPUT] {text}")
        print(f"[NORMALIZED] {normalized}")
        print(f"[INTENT] {matched_intent}")
        print(f"[CONFIDENCE] {matched_confidence}")
        print("===================================\n")

        return {
            "intent": matched_intent,
            "confidence": float(matched_confidence),
            "entities": entities,
            "normalized_text": normalized
        }

    # =========================
    # ML MODEL FALLBACK
    # =========================

    try:

        X = vectorizer.transform([normalized])

        probs = model.predict_proba(X)[0]

        confidence = float(max(probs))

        predicted_intent = model.classes_[probs.argmax()]

        predicted_intent = normalize_intent(predicted_intent)

        print("\n========== ML PREDICTION ==========")
        print(f"[INPUT] {text}")
        print(f"[NORMALIZED] {normalized}")
        print(f"[ML INTENT] {predicted_intent}")
        print(f"[ML CONFIDENCE] {confidence}")
        print("===================================\n")

        # LOW CONFIDENCE
        if confidence < UNKNOWN_CONFIDENCE_THRESHOLD:

            return {
                "intent": "unknown",
                "confidence": confidence,
                "entities": entities,
                "normalized_text": normalized
            }

        return {
            "intent": predicted_intent,
            "confidence": confidence,
            "entities": entities,
            "normalized_text": normalized
        }

    except Exception as e:

        print(f"[ML ERROR] {str(e)}")

        return {
            "intent": "unknown",
            "confidence": 0.0,
            "entities": entities,
            "normalized_text": normalized
        }