import re

# --- 1) Phrase-level replacements (run BEFORE token mapping) ---
PHRASE_MAP = {
    
    # =========================
    # URGENCY
    # =========================
    "as soon as possible": "urgent",
    "right now": "urgent",
    "immediately": "urgent",
    "jaldi": "urgent",
    "ventane": "urgent",

    # =========================
    # ELECTRICAL
    # =========================
    "fan not working": "electrician",
    "ceiling fan issue": "electrician",
    "light not working": "electrician",
    "switch board problem": "electrician",
    "wire problem": "electrician",
    "power issue": "electrician",
    "short circuit": "electrician",
    "socket issue": "electrician",
    "plug issue": "electrician",
    "mcb problem": "electrician",
    "electric problem": "electrician",
    "bijli problem": "electrician",
    "electric work": "electrician",
    "can u send bijli worker now": "electrician",
    "bijli worker": "electrician",
    "fan repair need urgent my kid scared": "electrician",
    "పంకా పని చేయడం లేదు": "electrician",
    "లైట్ ఆన్ కావడం లేదు": "electrician",
    "స్విచ్ బోర్డు కాలిపోయింది": "electrician",
    "వైర్ నుంచి స్పార్క్ వస్తోంది": "electrician",
    "ఇంట్లో కరెంట్ సమస్య ఉంది": "electrician",
    "ఫ్యాన్ చాలా స్లోగా తిరుగుతోంది": "electrician",
    "ఎలక్ట్రిషియన్ వెంటనే కావాలి": "electrician",
    "पंखा काम नहीं कर रहा": "electrician",
    "बिजली का स्विच जल गया": "electrician",
    "इलेक्ट्रीशियन चाहिए अभी": "electrician",

    # =========================
    # PLUMBING
    # =========================
    "pipe leakage": "plumber",
    "water leakage": "plumber",
    "tap issue": "plumber",
    "tap repair": "plumber",
    "bathroom leakage": "plumber",
    "sink problem": "plumber",
    "drainage issue": "plumber",
    "water pipe issue": "plumber",
    "water problem": "plumber",
    "toilet issue": "plumber",
    "flush issue": "plumber",

    # =========================
    # CLEANING
    # =========================
    "house cleaning": "cleaner",
    "home cleaning": "cleaner",
    "bathroom cleaning": "cleaner",
    "kitchen cleaning": "cleaner",
    "sofa cleaning": "cleaner",
    "room cleaning": "cleaner",
    "dust cleaning": "cleaner",
    "maid service": "cleaner",
    "cleaning service": "cleaner",

    # =========================
    # CARPENTER
    # =========================
    "door repair": "carpenter",
    "wood work": "carpenter",
    "cupboard repair": "carpenter",
    "furniture repair": "carpenter",
    "bed repair": "carpenter",
    "table repair": "carpenter",
    "chair repair": "carpenter",

    # =========================
    # AC TECHNICIAN
    # =========================
    "ac repair": "ac technician",
    "air conditioner repair": "ac technician",
    "ac cooling issue": "ac technician",
    "ac not cooling": "ac technician",
    "ac gas filling": "ac technician",
    "ac servicing": "ac technician",
    "cooler is not working": "cooler not working",
    "cooler is broken": "cooler not working",
    "cooler not cooling": "cooler not working",
    "ఏసీ చల్లగా చేయడం లేదు": "ac technician",
    "ఏసీ నుంచి నీరు కారుతోంది": "ac technician",
    "ఏసీ సర్వీస్ కావాలి": "ac technician",
    "ఏసీ శబ్దం చేస్తోంది": "ac technician",
    "ఏసీ రిమోట్ పని చేయడం లేదు": "ac technician",
    "ఏసీ మెకానిక్ వెంటనే కావాలి": "ac technician",
    "స్ప్లిట్ ఏసీ ఇన్స్టాలేషన్ కావాలి": "ac technician",
    "एसी ठंडा नहीं कर रहा": "ac technician",
    "एसी सर्विस चाहिए": "ac technician",

    # =========================
    # MECHANIC
    # =========================
    "bike repair": "mechanic",
    "car repair": "mechanic",
    "vehicle issue": "mechanic",
    "engine problem": "mechanic",
    "car breakdown": "mechanic",
    "bike puncture": "mechanic",

    # =========================
    # CARPENTER
    # =========================
    "install curtain rods": "carpenter",
    "make small wall shelf": "carpenter",
    "carpnter needed": "carpenter",
    "cupbord not closing": "carpenter",
    "darwaza kharab hai": "carpenter",
    "parda rod fit karna hai": "carpenter",
    "కార్పెంటర్ కావలి": "carpenter",
    "కార్పెంటర్ కావాలి": "carpenter",
    "తలుపు సరిగా మూసుకోవడం లేదు": "carpenter",
    "కుర్చీ కాలు విరিগింది": "carpenter",
    "బెడ్ శబ్దం చేస్తుంది": "carpenter",

    # =========================
    # PAINTING
    # =========================
    "wall painting": "painter",
    "home painting": "painter",
    "house painting": "painter",
    "paint work": "painter",

    # =========================
    # GARDENING
    # =========================
    "garden cleaning": "gardener",
    "plant maintenance": "gardener",
    "grass cutting": "gardener",
    "lawn maintenance": "gardener",

    # =========================
    # MASSAGE
    # =========================
    "body massage": "massage therapist",
    "spa massage": "massage therapist",
    "home massage": "massage therapist",
}


# --- 2) Token-level mapping ---
TOKEN_MAP = {

    # =========================
    # COMMON INTENT WORDS
    # =========================
    "kavali": "need",
    "avali": "need",
    "chahiye": "need",
    "required": "need",

    # =========================
    # REQUEST WORDS
    # =========================
    "bhejo": "send",
    "pampinchu": "send",
    "pampandi": "send",

    # =========================
    # URGENCY
    # =========================
    "urgent": "urgent",
    "jaldi": "urgent",
    "fast": "urgent",

    # =========================
    # LOCATION
    # =========================
    "ghar": "home",
    "house": "home",
    "intlo": "home",

    # =========================
    # ELECTRICIAN
    # =========================
    "electrician": "electrician",
    "electrcian": "electrician",
    "electrican": "electrician",
    "electrition": "electrician",
    "electric": "electrician",

    # =========================
    # PLUMBER
    # =========================
    "plumber": "plumber",
    "plumbr": "plumber",
    "plummer": "plumber",

    # =========================
    # CLEANER
    # =========================
    "cleaner": "cleaner",
    "cleanr": "cleaner",
    "cleaning": "cleaner",
    "maid": "cleaner",

    # =========================
    # CARPENTER
    # =========================
    "carpenter": "carpenter",
    "woodworker": "carpenter",

    # =========================
    # AC TECHNICIAN
    # =========================
    "ac": "ac technician",
    "airconditioner": "ac technician",
    "aircondition": "ac technician",

    # =========================
    # MECHANIC
    # =========================
    "mechanic": "mechanic",
    "mechnic": "mechanic",

    # =========================
    # PAINTER
    # =========================
    "painter": "painter",
    "painting": "painter",

    # =========================
    # GARDENER
    # =========================
    "gardener": "gardener",
    "gardening": "gardener",

    # =========================
    # MASSAGE
    # =========================
    "massage": "massage therapist",
    "spa": "massage therapist",

    # =========================
    # REPAIR WORDS
    # =========================
    "repair": "repair",
    "fix": "repair",
    "issue": "problem",
    "problem": "problem",
}

def normalize_text(text: str) -> str:
    text = text.lower().strip()

    # phrase normalization first so multilingual and exact keyword phrases survive cleanup
    for phrase, replacement in PHRASE_MAP.items():
        if phrase in text:
            text = text.replace(phrase, replacement)

    # basic cleanup after phrase normalization
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)

    # token normalization
    tokens = text.split()
    tokens = [TOKEN_MAP.get(t, t) for t in tokens]

    return " ".join(tokens)