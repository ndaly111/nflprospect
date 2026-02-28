"""Shared utilities for the NFL prospect pipeline."""
import re
import unicodedata
from rapidfuzz import fuzz


def normalize_name(name: str) -> str:
    """Lowercase, strip accents, remove punctuation, collapse whitespace."""
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    name = name.lower()
    name = re.sub(r"['\-\.]", ' ', name)
    name = re.sub(r'[^a-z0-9 ]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def make_id(name: str, position: str, school: str) -> str:
    """Create a stable slug ID for a prospect."""
    parts = [name, position, school]
    slug = '-'.join(normalize_name(p) for p in parts)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug


def fuzzy_match_player(
    target_name: str,
    candidates: list[dict],
    name_key: str = 'name',
    threshold: int = 85,
) -> dict | None:
    """
    Find the best matching candidate for target_name using token_sort_ratio.
    Returns the matched dict or None if no match exceeds threshold.
    """
    norm_target = normalize_name(target_name)
    best_score = 0
    best_match = None

    for c in candidates:
        norm_cand = normalize_name(c.get(name_key, ''))
        score = fuzz.token_sort_ratio(norm_target, norm_cand)
        if score > best_score:
            best_score = score
            best_match = c

    if best_score >= threshold:
        return best_match
    return None
