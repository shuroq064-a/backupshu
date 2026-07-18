import re
import dateparser


# =========================
# LANGUAGE NORMALIZATION
# =========================
LANG_MAP = {
    # Telugu
    "రేపు": "tomorrow",
    "ఈరోజు": "today",
    "ఇప్పుడు": "now",
    "సాయంత్రం": "evening",
    "ఉదయం": "morning",

    # Hindi
    "कल": "tomorrow",
    "आज": "today",
    "अभी": "now",
    "शाम": "evening",
    "सुबह": "morning",
}


def normalize_language(text: str):
    for k, v in LANG_MAP.items():
        text = text.replace(k, v)
    return text


# =========================
# TIME EXTRACTION
# =========================
def extract_time(text: str):
    text = text.strip().lower()

    if not text:
        return None

    # Only attempt parsing when the query contains likely time/date hints.
    if not re.search(
        r"\b(\d{1,4}(:\d{2})?|am|pm|tomorrow|today|now|tonight|morning|evening|noon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        text,
        flags=re.IGNORECASE,
    ):
        return None

    dt = dateparser.parse(
        text,
        languages=["en"],
        settings={
            "PREFER_DATES_FROM": "future",
            "RETURN_AS_TIMEZONE_AWARE": False,
            "STRICT_PARSING": True,
        },
    )

    if not dt:
        return None

    return dt.strftime("%Y-%m-%d %H:%M:%S")


# =========================
# LOCATION (HOME/OFFICE)
# =========================
LOCATION_KEYWORDS = {
    "home": "home",
    "house": "home",
    "office": "office",
    "near": "near_me"
}


# =========================
# CITY DETECTION
# =========================
CITY_MAP = {
    # English
    "hyderabad": "Hyderabad",
    "secunderabad": "Hyderabad",
    "karimnagar": "Karimnagar",
    "warangal": "Warangal",
    "nizamabad": "Nizamabad",

    # Telugu
    "హైదరాబాద్": "Hyderabad",
    "కరీంనగర్": "Karimnagar",
    "వరంగల్": "Warangal",

    # Hindi
    "हैदराबाद": "Hyderabad"
}


def extract_city(text: str):
    for key, value in CITY_MAP.items():
        if key in text:
            return value
    return None


# =========================
# MAIN ENTITY EXTRACTOR
# =========================
def extract_entities(text: str):
    text = text.lower().strip()

    # Clean text
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)

    # Normalize language
    text = normalize_language(text)

    entities = {
        "time": None,
        "location": None,
        "city": None
    }

    # -------------------------
    # TIME (primary)
    # -------------------------
    parsed_time = extract_time(text)
    if parsed_time:
        entities["time"] = parsed_time

    # -------------------------
    # TIME fallback
    # -------------------------
    if not entities["time"]:
        if "tomorrow" in text:
            entities["time"] = "tomorrow"
        elif "today" in text:
            entities["time"] = "today"
        elif "now" in text or "asap" in text:
            entities["time"] = "now"

    # -------------------------
    # LOCATION
    # -------------------------
    for word, value in LOCATION_KEYWORDS.items():
        if word in text:
            entities["location"] = value
            break

    # -------------------------
    # CITY
    # -------------------------
    city = extract_city(text)
    if city:
        entities["city"] = city

    return entities