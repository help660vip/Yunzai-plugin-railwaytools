#!/usr/bin/env python3
"""Synchronize curated railway encyclopedia seeds from Wikidata.

This is a maintainer-only tool. The Yunzai plugin never imports or executes it.
It uses only the Python standard library and merges new entries atomically,
without overwriting hand-curated records.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SEEDS_FILE = ROOT / "tools" / "encyclopedia-seeds.json"
DATA_DIR = ROOT / "data" / "encyclopedia"
API_URL = "https://www.wikidata.org/w/api.php"
USER_AGENT = (
    "Yunzai-plugin-railwaytools-encyclopedia-sync/1.0 "
    "(https://github.com/help660vip/Yunzai-plugin-railwaytools)"
)
TYPE_METADATA = {
    "train": ("动车组与高铁车型", "动车组", "动车组车型"),
    "locomotive": ("机车型号", "机车", "机车型号"),
    "line": ("铁路线路", "铁路线路", "铁路线路"),
    "station": ("车站资料", "铁路车站", "铁路车站"),
}


def normalize(value: str) -> str:
    return re.sub(r"[\s_-]+", "", value).casefold()


def request_json(params: dict[str, str], retries: int = 3) -> dict[str, Any]:
    query = urlencode({**params, "format": "json", "maxlag": "5"})
    request = Request(
        f"{API_URL}?{query}",
        headers={
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=15) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code not in {429, 503} or attempt == retries - 1:
                raise
            retry_after = int(error.headers.get("Retry-After", "2"))
            time.sleep(max(1, min(retry_after, 30)))
        except (TimeoutError, URLError):
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("Wikidata request failed")


def score_result(result: dict[str, Any], seed: dict[str, str]) -> int:
    expected = normalize(seed["id"])
    label = normalize(str(result.get("label", "")))
    description = normalize(str(result.get("description", "")))
    aliases = [normalize(str(alias)) for alias in result.get("aliases", [])]
    if label == expected or expected in aliases:
        return 100
    if expected and (expected in label or label in expected):
        return 70
    if expected and expected in description:
        return 40
    return 0


def search_seed(seed: dict[str, str]) -> dict[str, Any] | None:
    candidates: list[dict[str, Any]] = []
    search_terms = dict.fromkeys((seed["id"], seed["query"]))
    for search_term in search_terms:
        payload = request_json(
            {
                "action": "wbsearchentities",
                "search": search_term,
                "language": "zh",
                "uselang": "zh",
                "type": "item",
                "limit": "10",
            }
        )
        candidates.extend(
            result
            for result in payload.get("search", [])
            if re.fullmatch(r"Q\d+", str(result.get("id", "")))
        )
        if any(score_result(result, seed) == 100 for result in candidates):
            break
    candidates.sort(key=lambda result: score_result(result, seed), reverse=True)
    if not candidates or score_result(candidates[0], seed) == 0:
        return None
    return candidates[0]


def to_entry(entry_type: str, seed: dict[str, str], result: dict[str, Any]) -> dict[str, Any] | None:
    description = str(result.get("description", "")).strip()
    result_label = str(result.get("label", "")).strip()
    if not result_label:
        return None
    category, subject, fallback_subject = TYPE_METADATA[entry_type]
    label = seed["id"] if entry_type in {"line", "station"} else result_label
    if not re.search(r"[\u3400-\u9fff]", description):
        description = f"{label}是{fallback_subject}。"
    elif description[-1] not in "。！？":
        description += "。"
    aliases = {
        seed["id"],
        result_label,
        *[str(alias).strip() for alias in result.get("aliases", []) if str(alias).strip()],
    }
    aliases.discard(label)
    return {
        "id": seed["id"],
        "name": label,
        "category": category,
        "aliases": sorted(aliases),
        "summary": description,
        "details": [f"该条目属于{subject}基础资料，可通过关键词继续检索。"],
        "source": "Wikidata（CC0）",
        "sourceId": result["id"],
    }


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: Any) -> None:
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{path.stem}-", suffix=".json", dir=path.parent
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        json.loads(temp_path.read_text(encoding="utf-8"))
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def sync(apply_changes: bool, delay: float) -> int:
    seeds = load_json(SEEDS_FILE)
    staged: dict[str, list[dict[str, Any]]] = {}
    failures: list[str] = []

    for entry_type in TYPE_METADATA:
        current = load_json(DATA_DIR / f"{entry_type}.json")
        current_indexes = {
            normalize(str(entry.get("id", ""))): index for index, entry in enumerate(current)
        }
        curated_ids = {
            normalize(str(entry.get("id", "")))
            for entry in current
            if not entry.get("sourceId")
        }
        additions: list[dict[str, Any]] = []
        refreshes = 0
        for seed in seeds.get(entry_type, []):
            normalized_id = normalize(seed["id"])
            if normalized_id in curated_ids:
                continue
            try:
                result = search_seed(seed)
                entry = to_entry(entry_type, seed, result) if result else None
            except (HTTPError, URLError, TimeoutError, ValueError) as error:
                failures.append(f"{entry_type}:{seed['id']} ({error})")
                entry = None
            if entry:
                if normalized_id in current_indexes:
                    current[current_indexes[normalized_id]] = entry
                    refreshes += 1
                else:
                    current_indexes[normalized_id] = len(current) + len(additions)
                    additions.append(entry)
            else:
                failures.append(f"{entry_type}:{seed['id']} (no verified match)")
            time.sleep(max(0.2, delay))
        staged[entry_type] = current + additions
        print(
            f"{entry_type}: {len(current)} existing, "
            f"{len(additions)} additions, {refreshes} refreshed"
        )

    if apply_changes:
        for entry_type, entries in staged.items():
            write_json_atomic(DATA_DIR / f"{entry_type}.json", entries)
        print("Validated entries were merged atomically.")
    else:
        print("Dry run only; pass --apply to merge validated entries.")

    if failures:
        print("Skipped:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="merge validated records into data/encyclopedia/*.json",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.25,
        help="minimum delay between requests in seconds (default: 0.25)",
    )
    args = parser.parse_args()
    return sync(args.apply, args.delay)


if __name__ == "__main__":
    raise SystemExit(main())
