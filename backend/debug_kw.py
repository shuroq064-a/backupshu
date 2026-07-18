from services.service_keywords import SERVICE_SYNONYMS
from services.nlp_service import normalize_intent

text = 'window frame repair'
t = text.lower()
tokens = set(t.split())
for raw_intent, keywords in SERVICE_SYNONYMS.items():
    normalized_intent = normalize_intent(raw_intent)
    if normalized_intent == 'unknown':
        continue
    for keyword in keywords:
        k = keyword.lower().strip()
        if not k:
            continue
        token_list = [token for token in k.split() if token]
        if k in t:
            print('EXACT', normalized_intent, k)
        matching = set(token_list).intersection(tokens)
        if matching:
            print('PARTIAL', normalized_intent, k, matching)
