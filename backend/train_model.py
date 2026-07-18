import os
import json
import random
import joblib
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.utils.class_weight import compute_class_weight


# ==========================================
# BASE PATHS
# ==========================================

BASE_DIR = os.path.dirname(__file__)

DATASET_DIR = os.path.join(BASE_DIR, "datasets")

TRAINING_JSON = os.path.join(
    BASE_DIR,
    "training_data.json"
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "model.pkl"
)

VECTORIZER_PATH = os.path.join(
    BASE_DIR,
    "models",
    "vectorizer.pkl"
)


# ==========================================
# DATASET FILES
# ==========================================

SERVICE_FILES = {

    "Electrical": "electrical.txt",
    "Plumbing": "plumbing.txt",
    "AC Repair": "ac_repair.txt",
    "Carpenter": "carpenter.txt",
    "Massage": "massage.txt",
    "Cleaning": "cleaning.txt",
    "Painting": "painting.txt",
    "Gardening": "gardening.txt",
    "Unknown": "unknown.txt"
}


# ==========================================
# BUILD TRAINING DATA
# ==========================================

training_data = []

for intent, filename in SERVICE_FILES.items():

    file_path = os.path.join(DATASET_DIR, filename)

    if not os.path.exists(file_path):

        print(f"Missing dataset file: {filename}")
        continue

    with open(file_path, "r", encoding="utf-8") as f:

        lines = f.readlines()

    for line in lines:

        text = line.strip()

        if not text or text.startswith("---"):
            continue

        training_data.append({
            "text": text,
            "intent": intent
        })


print(f"Total raw samples: {len(training_data)}")

# Check class distribution BEFORE shuffling
intent_counts = {}
for item in training_data:
    intent = item["intent"]
    intent_counts[intent] = intent_counts.get(intent, 0) + 1

print("\nClass distribution (before split):")
for intent, count in sorted(intent_counts.items()):
    print(f"  {intent}: {count}")

# ==========================================
# SHUFFLE DATA
# ==========================================

random.seed(42)  # Reproducible shuffling
random.shuffle(training_data)


# ==========================================
# SAVE training_data.json
# ==========================================

with open(TRAINING_JSON, "w", encoding="utf-8") as f:

    json.dump(training_data, f, indent=4, ensure_ascii=False)

print(f"\nSaved training_data.json with {len(training_data)} samples")


# ==========================================
# PREPARE DATA
# ==========================================

texts = [item["text"] for item in training_data]

labels = [item["intent"] for item in training_data]


# ==========================================
# TRAIN / VALIDATION / TEST SPLIT (to avoid data leakage)
# ==========================================

# First split: 70% train, 30% temp (validation + test)
X_train, X_temp, y_train, y_temp = train_test_split(
    texts,
    labels,
    test_size=0.3,
    random_state=42,
    stratify=labels  # Ensure class balance in splits
)

# Second split: split temp into validation (50%) and test (50%)
X_val, X_test, y_val, y_test = train_test_split(
    X_temp,
    y_temp,
    test_size=0.5,
    random_state=42,
    stratify=y_temp
)

print(f"\nData split:")
print(f"  Training: {len(X_train)} samples")
print(f"  Validation: {len(X_val)} samples")
print(f"  Testing: {len(X_test)} samples")


# ==========================================
# TF-IDF VECTORIZER
# ==========================================

vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    stop_words="english",
    lowercase=True,
    max_features=5000,  # Limit features to prevent overfitting
    min_df=2,  # Minimum document frequency
    max_df=0.8  # Maximum document frequency
)


# ==========================================
# TRANSFORM DATA - FIT ONLY ON TRAINING SET
# ==========================================

X_train_vec = vectorizer.fit_transform(X_train)

X_val_vec = vectorizer.transform(X_val)  # Transform validation set

X_test_vec = vectorizer.transform(X_test)  # Transform test set (SEPARATE from training!)


print(f"\nVectorizer features: {vectorizer.get_feature_names_out().shape[0]}")


# ==========================================
# COMPUTE CLASS WEIGHTS (handle imbalance)
# ==========================================

class_weights = compute_class_weight(
    'balanced',
    classes=np.unique(y_train),
    y=y_train
)

class_weight_dict = {
    cls: weight for cls, weight in zip(np.unique(y_train), class_weights)
}

print("\nClass weights (for imbalanced data):")
for cls, weight in class_weight_dict.items():
    print(f"  {cls}: {weight:.2f}")


# ==========================================
# MODEL SETUP
# ==========================================

def build_logistic_model() -> LogisticRegression:
    model_kwargs = {
        "max_iter": 2000,
        "class_weight": "balanced",
        "random_state": 42,
        "solver": "lbfgs",
    }

    # Let scikit-learn choose the correct multi-class mode automatically.
    return LogisticRegression(**model_kwargs)


model = build_logistic_model()


# ==========================================
# TRAIN MODEL
# ==========================================

print("\nTraining model...")
model.fit(X_train_vec, y_train)


# ==========================================
# VALIDATION SET PREDICTIONS
# ==========================================

val_predictions = model.predict(X_val_vec)
val_accuracy = accuracy_score(y_val, val_predictions)

print(f"\nValidation Accuracy: {val_accuracy:.4f}")


# ==========================================
# TEST SET PREDICTIONS (Final evaluation)
# ==========================================

test_predictions = model.predict(X_test_vec)
test_accuracy = accuracy_score(y_test, test_predictions)

print(f"\nTest Accuracy: {test_accuracy:.4f}")

print("\nClassification Report (Test Set):\n")
print(classification_report(y_test, test_predictions))

print("\nConfusion Matrix (Test Set):\n")
print(confusion_matrix(y_test, test_predictions))


# ==========================================
# CROSS-VALIDATION (additional validation)
# ==========================================

cv_scores = cross_val_score(
    model,
    X_train_vec,
    y_train,
    cv=5,
    scoring='accuracy'
)

print(f"\n5-Fold Cross-Validation Scores: {cv_scores}")
print(f"Mean CV Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")


# ==========================================
# CHECK FOR OVERFITTING
# ==========================================

train_predictions = model.predict(X_train_vec)
train_accuracy = accuracy_score(y_train, train_predictions)

print(f"\nTrain Accuracy: {train_accuracy:.4f}")
print(f"Test Accuracy: {test_accuracy:.4f}")
print(f"Overfitting check: Train-Test gap = {(train_accuracy - test_accuracy):.4f}")

if train_accuracy - test_accuracy > 0.15:
    print("⚠️  WARNING: Large gap indicates potential overfitting!")
else:
    print("✓ Gap is acceptable (< 0.15)")


# ==========================================
# SAVE MODEL
# ==========================================

joblib.dump(model, MODEL_PATH)

joblib.dump(vectorizer, VECTORIZER_PATH)

print("\n✓ Model saved successfully")
print("✓ Vectorizer saved successfully")

# ==========================================
# SAVE TRAINING METADATA
# ==========================================

metadata = {
    "total_samples": len(training_data),
    "train_samples": len(X_train),
    "val_samples": len(X_val),
    "test_samples": len(X_test),
    "vectorizer_features": vectorizer.get_feature_names_out().shape[0],
    "test_accuracy": float(test_accuracy),
    "train_accuracy": float(train_accuracy),
    "val_accuracy": float(val_accuracy),
    "cv_mean_accuracy": float(cv_scores.mean()),
    "cv_std": float(cv_scores.std()),
    "classes": list(model.classes_),
    "class_weights": class_weight_dict
}

metadata_path = os.path.join(BASE_DIR, "models", "metadata.json")
with open(metadata_path, "w") as f:
    json.dump(metadata, f, indent=2)

print("\n✓ Training metadata saved to models/metadata.json")


def classify_text(text: str, threshold: float = 0.25) -> dict[str, object]:
    normalized = text.strip()

    if not normalized or not any(char.isalpha() for char in normalized):
        return {
            "intent": "unknown",
            "confidence": 0.0,
            "text": text,
            "explanation": "No alphabetic text or empty query"
        }

    X = vectorizer.transform([normalized])
    probs = model.predict_proba(X)[0]
    best_index = int(np.argmax(probs))
    confidence = float(probs[best_index])
    intent = model.classes_[best_index]

    if confidence < threshold:
        return {
            "intent": "unknown",
            "confidence": confidence,
            "text": text,
            "explanation": "Low confidence; likely out of syllabus"
        }

    return {
        "intent": intent,
        "confidence": confidence,
        "text": text,
        "explanation": "High-confidence prediction"
    }


sample_queries = [
    "My light switch is not working",
    "Please send electrician immediately",
    "Pipe leak in my kitchen sink",
    "AC is on but not cooling",
    "doctor",
    "cnkjv",
    "5336"
]

print("\nSample query predictions:")
for query in sample_queries:
    result = classify_text(query)
    label = result["intent"]
    message = label if label != "unknown" else "unknown (needs more clarification)"
    print(
        f"  {query!r} -> {message} "
        f"(confidence={result['confidence']:.2f}, explanation={result['explanation']})"
    )

