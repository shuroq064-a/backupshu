import contextlib
import io
import os
import sys
import time
from collections import Counter

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from services.nlp_service import predict_pipeline
from services.worker_matching import service_matches_intent
from testing.test_queries import TEST_QUERIES


LOAD_TEST_SIZE = 5000


def quiet_predict(query: str):
    with contextlib.redirect_stdout(io.StringIO()):
        return predict_pipeline(query)


def run_accuracy_tests():
    failed = []
    sources = Counter()
    start = time.perf_counter()

    for query, expected_intent in TEST_QUERIES:
        result = quiet_predict(query)
        predicted_intent = result["intent"]
        sources[result.get("source", "unknown")] += 1

        if predicted_intent != expected_intent:
            failed.append({
                "query": query,
                "expected": expected_intent,
                "predicted": predicted_intent,
                "confidence": result.get("confidence"),
                "source": result.get("source"),
                "normalized": result.get("normalized_text"),
            })

    elapsed = time.perf_counter() - start
    total = len(TEST_QUERIES)
    passed = total - len(failed)

    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "accuracy": (passed / total) * 100,
        "elapsed": elapsed,
        "avg_ms": (elapsed * 1000) / total,
        "sources": sources,
    }


def run_matching_tests():
    checks = [
        ("Electrician", "Electrical"),
        ("Electrical technician", "Electrical"),
        ("AC mechanic", "AC Repair"),
        ("Plumber", "Plumbing"),
        ("Carpenter", "Carpenter"),
        ("Home cleaner", "Cleaning"),
        ("Painter", "Painting"),
        ("Gardener", "Gardening"),
        ("Massage therapist", "Massage"),
    ]

    failed = [
        {"skill": skill, "intent": intent}
        for skill, intent in checks
        if not service_matches_intent(skill, intent)
    ]

    return {
        "total": len(checks),
        "passed": len(checks) - len(failed),
        "failed": failed,
    }


def run_load_test():
    queries = [
        TEST_QUERIES[index % len(TEST_QUERIES)][0]
        for index in range(LOAD_TEST_SIZE)
    ]

    # Warm up model/vectorizer and import caches outside the measured loop.
    quiet_predict("My cooler is not working")

    start = time.perf_counter()

    for query in queries:
        quiet_predict(query)

    elapsed = time.perf_counter() - start

    return {
        "total": len(queries),
        "elapsed": elapsed,
        "avg_ms": (elapsed * 1000) / len(queries),
        "queries_per_second": len(queries) / elapsed,
    }


def main():
    print("\nRUNNING NLP ACCURACY TESTS")
    print("=" * 60)

    accuracy = run_accuracy_tests()

    print(f"Total Tests    : {accuracy['total']}")
    print(f"Passed         : {accuracy['passed']}")
    print(f"Failed         : {len(accuracy['failed'])}")
    print(f"Accuracy       : {accuracy['accuracy']:.2f}%")
    print(f"Execution Time : {accuracy['elapsed']:.3f} sec")
    print(f"Average Time   : {accuracy['avg_ms']:.3f} ms/query")
    print(f"Sources        : {dict(accuracy['sources'])}")

    if accuracy["failed"]:
        print("\nFAILED NLP CASES")
        print("=" * 60)
        for item in accuracy["failed"][:50]:
            print(item)

    print("\nRUNNING SPECIALIST MATCH TESTS")
    print("=" * 60)

    matching = run_matching_tests()

    print(f"Total Tests    : {matching['total']}")
    print(f"Passed         : {matching['passed']}")
    print(f"Failed         : {len(matching['failed'])}")

    if matching["failed"]:
        print("\nFAILED MATCH CASES")
        print("=" * 60)
        for item in matching["failed"]:
            print(item)

    print("\nRUNNING LOAD TEST")
    print("=" * 60)

    load = run_load_test()

    print(f"Total Queries        : {load['total']}")
    print(f"Execution Time       : {load['elapsed']:.3f} sec")
    print(f"Average Time         : {load['avg_ms']:.3f} ms/query")
    print(f"Throughput           : {load['queries_per_second']:.2f} queries/sec")

    if accuracy["failed"] or matching["failed"]:
        raise SystemExit(1)

    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    main()
