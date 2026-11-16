"""The favorites ids every listing carries: `org_id` and `series_id`.

The recipe is in docs/EVENT-FORMAT.md, "Ids for favorites: org_id and series_id".
Any city running the hub can rebuild the same ids from the same listing.

- org_id: "o-" and the first 16 hex characters of SHA-256 over "org-id", the byte
  0x1F and the normalized organization name. None when the normalized name is empty.
- series_id: only on a recurring listing. "s-" and the first 16 hex characters of
  SHA-256 over "series", source_id and the source's own series key, joined by 0x1F;
  when the source gives no key, "series", source_id, the normalized organization
  name and the recurrence_rule. None when there is neither, and on every listing
  that does not repeat. Never built from the title or the date.

tests/test_ids.py pins this module to the recipe on the format page.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any

SEP = "\x1f"
ORG_SUFFIXES = frozenset({"inc", "incorporated", "llc", "ltd", "co", "corp", "corporation", "org"})
ORG_ID = re.compile(r"^o-[0-9a-f]{16}$")
SERIES_ID = re.compile(r"^s-[0-9a-f]{16}$")


def org_norm(name: Any) -> str:
    """Normalize an organization name, as in docs/EVENT-FORMAT.md."""
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).casefold()
    words = re.sub(r"[^0-9a-z]+", " ", text.replace("&", " and ")).split()
    if words and words[0] == "the":
        words = words[1:]
    while words and words[-1] in ORG_SUFFIXES:
        words = words[:-1]
    return " ".join(words)


def _short(prefix: str, parts: list[str]) -> str:
    digest = hashlib.sha256(SEP.join(parts).encode("utf-8")).hexdigest()
    return f"{prefix}-{digest[:16]}"


def org_id(org_name: Any) -> str | None:
    """The organization's id, or None when its normalized name is empty."""
    norm = org_norm(org_name)
    return _short("o", ["org-id", norm]) if norm else None


def series_id(
    *,
    recurring: bool,
    source_id: str,
    series_key: str | None = None,
    org_name: Any = None,
    recurrence_rule: str | None = None,
) -> str | None:
    """The id shared by every date of one repeating shift, or None."""
    if not recurring or not source_id:
        return None
    if series_key:
        return _short("s", ["series", source_id, series_key])
    norm = org_norm(org_name)
    if norm and recurrence_rule:
        return _short("s", ["series", source_id, norm, recurrence_rule])
    return None
