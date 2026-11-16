"""The favorites ids, org_id and series_id, in scraper output.

docs/EVENT-FORMAT.md, "Ids for favorites: org_id and series_id". Pins pvscrapers/ids.py
to the recipe on that page, checks every listing a scraper writes carries both ids, and
checks the event schema accepts them.
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from pathlib import Path

import pytest

from guards import event_schema
from pvscrapers import ids
from pvscrapers.core import SourceDefaults
from pvscrapers.scrapers import tec_ical

ROOT = Path(__file__).resolve().parent.parent
FORMAT_PAGE = ROOT / "docs" / "EVENT-FORMAT.md"
FETCHED = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
RULE = "FREQ=WEEKLY;BYDAY=TU"
SOURCE = {
    "id": "example-org",
    "org_name": "The Example Garden, Inc.",
    "url": "https://org.example.org/events/?ical=1",
    "area": "example-city",
    "listing_language": "en",
    "default_type": "service",
}


def _sha16(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]


@pytest.mark.parametrize(
    ("name", "norm"),
    [
        ("The Food Trust, Inc.", "food trust"),  # the example on the format page
        ("Café Ünïcode & Friends LLC", "cafe unicode and friends"),
        ("  PHILABUNDANCE  ", "philabundance"),
        ("Theatre Group Co. Ltd.", "theatre group"),
        ("The Corp", ""),
        ("!!!", ""),
        (None, ""),
    ],
)
def test_normalizing_follows_the_format_page(name, norm):
    assert ids.org_norm(name) == norm


def test_the_format_page_example_and_suffix_list():
    page = FORMAT_PAGE.read_text(encoding="utf-8")
    assert '"The Food Trust, Inc." becomes `food trust`' in page
    for suffix in ids.ORG_SUFFIXES:
        assert f"`{suffix}`" in page
    listed = re.search(r"while the last word is one of (.+?), drop it", page)
    assert listed and set(re.findall(r"`([a-z]+)`", listed.group(1))) == ids.ORG_SUFFIXES


def test_org_id_recipe():
    expected = "o-" + _sha16("org-id", "food trust")
    assert ids.org_id("The Food Trust, Inc.") == expected
    assert ids.org_id("FOOD TRUST") == expected  # same organization, same id
    assert ids.org_id("Food Bank") != expected
    assert ids.org_id("!!!") is None
    assert ids.ORG_ID.match(expected)


def test_series_id_recipe():
    keyed = ids.series_id(recurring=True, source_id="src", series_key="parent-7")
    assert keyed == "s-" + _sha16("series", "src", "parent-7")
    fallback = ids.series_id(
        recurring=True, source_id="src", org_name="The Food Trust", recurrence_rule=RULE
    )
    assert fallback == "s-" + _sha16("series", "src", "food trust", RULE)
    assert ids.SERIES_ID.match(keyed) and ids.SERIES_ID.match(fallback)
    # Another source's series with the same key is a different series.
    assert ids.series_id(recurring=True, source_id="other", series_key="parent-7") != keyed


def test_series_id_is_null_when_there_is_nothing_safe_to_build_it_from():
    assert ids.series_id(recurring=False, source_id="src", series_key="k") is None
    assert ids.series_id(recurring=True, source_id="src", org_name="Food Trust") is None
    assert ids.series_id(recurring=True, source_id="src", recurrence_rule=RULE) is None
    assert ids.series_id(recurring=True, source_id="", series_key="k") is None


def _listing(**changes):
    defaults = SourceDefaults.from_source(SOURCE)
    when = datetime(2026, 10, 20, 9, tzinfo=UTC)
    return defaults.listing(
        own_id="1",
        title="Garden day",
        start=when,
        end=None,
        address=None,
        link="https://org.example.org/event/1/",
        fetched_at=FETCHED,
        **changes,
    )


def test_every_listing_carries_both_ids():
    one_time = _listing()
    assert one_time["org_id"] == ids.org_id("Example Garden")
    assert one_time["series_id"] is None
    keyed = _listing(recurrence_rule=RULE, series_key="uid-1")
    assert keyed["series_id"] == "s-" + _sha16("series", "example-org", "uid-1")
    unkeyed = _listing(recurrence_rule=RULE)
    assert unkeyed["series_id"] == "s-" + _sha16("series", "example-org", "example garden", RULE)
    # A key alone never makes a one-time listing part of a series.
    assert _listing(series_key="uid-1")["series_id"] is None


def test_title_and_date_never_change_the_series_id():
    a = _listing(recurrence_rule=RULE)
    defaults = SourceDefaults.from_source(SOURCE)
    b = defaults.listing(
        own_id="2",
        title="Another title",
        start=datetime(2026, 10, 27, 9, tzinfo=UTC),
        end=None,
        address=None,
        link="https://org.example.org/event/2/",
        fetched_at=FETCHED,
        recurrence_rule=RULE,
    )
    assert a["series_id"] == b["series_id"]


def _feed(*events: str) -> str:
    body = "\r\n".join(f"BEGIN:VEVENT\r\n{e}\r\nEND:VEVENT" for e in events)
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-TIMEZONE:America/New_York\r\n"
        f"{body}\r\nEND:VCALENDAR\r\n"
    )


def _event(uid: str | None, extra: str = "", day: str = "20") -> str:
    lines = [
        *([f"UID:{uid}"] if uid else []),
        "SUMMARY:Garden day",
        f"DTSTART;TZID=America/New_York:202610{day}T090000",
        f"DTEND;TZID=America/New_York:202610{day}T120000",
        "URL:https://org.example.org/event/garden/",
    ]
    return "\r\n".join(lines + ([extra] if extra else []))


def test_ical_feed_uses_its_uid_as_the_series_key():
    feed = _feed(_event("7@example.org", f"RRULE:{RULE}"), _event("8@example.org", day="21"))
    repeating, one_time = tec_ical.parse(feed, SOURCE, FETCHED)
    assert repeating["series_id"] == "s-" + _sha16("series", "example-org", "7@example.org")
    assert one_time["series_id"] is None
    assert repeating["org_id"] == one_time["org_id"] == ids.org_id(SOURCE["org_name"])


def test_ical_feed_without_a_uid_falls_back_to_name_and_rule():
    (listing,) = tec_ical.parse(_feed(_event(None, f"RRULE:{RULE}")), SOURCE, FETCHED)
    assert listing["series_id"] == "s-" + _sha16("series", "example-org", "example garden", RULE)


def test_the_event_schema_accepts_scraper_ids():
    validator = event_schema.event_validator(ROOT)
    for listing in (_listing(), _listing(recurrence_rule=RULE, series_key="uid-1")):
        assert not list(validator.iter_errors(listing))
