"""CI workflow safety (PROJECT.md section 13; security checklist).

Identical in both repos.

- Every action is pinned to a full commit id, so a moved tag cannot change what runs.
- No workflow uses pull_request_target, which would run code from a fork with
  this repo's permissions.
- Every workflow states its permissions, and none grants write access.
- No workflow reads a secret.
- A site build runs with --silent, so the log never lists page paths.

Exception: a workflow named in REVIEWED may use secrets and write permissions.
The security gatekeeper reviews each one, and its own test file (named there)
checks exactly which job holds which secret and which permission. In the
private repo that is the scheduled pipeline (decision 0026).
The exception applies only in the private repo: it needs PROJECT.md and
config/sources.yml at the repo root, and the public repo's leak check refuses
both names, so a public pull request cannot switch it on.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = sorted((ROOT / ".github/workflows").glob("*.y*ml"))

USES = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)", re.MULTILINE)
PINNED = re.compile(r"^[\w.\-]+/[\w.\-/]+@[0-9a-f]{40}$")

# Workflow file -> the test file that checks its secrets and permissions line by line.
REVIEWED = {"pipeline.yml": "test_pipeline_workflow.py"}


def _code(path: Path) -> str:
    """Workflow text without comments, so a comment cannot trip or hide a check."""
    lines = []
    for line in path.read_text(encoding="utf-8").splitlines():
        lines.append(re.sub(r"(^|\s)#.*$", "", line))
    return "\n".join(lines)


def _private_repo() -> bool:
    """Both files are on the public repo's block list (tests/guards/repo_guard.py)."""
    root = Path(__file__).resolve().parent.parent
    return (root / "PROJECT.md").is_file() and (root / "config/sources.yml").is_file()


def _reviewed(path: Path) -> bool:
    """True for a reviewed exception, in the private repo only; its own test file must exist."""
    if path.name not in REVIEWED or not _private_repo():
        return False
    own_tests = Path(__file__).resolve().parent / REVIEWED[path.name]
    assert own_tests.is_file(), f"{path.name} is an exception but {own_tests.name} is missing"
    return True


def test_there_are_workflows():
    assert WORKFLOWS, "no workflow files in .github/workflows/"


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_actions_are_pinned_to_a_commit(path: Path):
    loose = [
        u
        for u in USES.findall(_code(path))
        if not u.startswith(("./", "docker://")) and not PINNED.match(u)
    ]
    assert not loose, f"actions not pinned to a full commit id: {loose}"


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_no_pull_request_target(path: Path):
    assert "pull_request_target" not in _code(path)


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_permissions_are_declared(path: Path):
    assert re.search(r"^permissions:", _code(path), re.MULTILINE)


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_no_write_permission(path: Path):
    if _reviewed(path):
        return
    code = _code(path)
    assert not re.search(r":\s*write\b", code), "a workflow grants write access"
    assert "write-all" not in code, "a workflow grants write access"


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_no_secrets_used(path: Path):
    if _reviewed(path):
        return
    assert not re.search(r"\bsecrets\.", _code(path)), "a workflow reads a secret"


SITE_BUILD = re.compile(r"\b(astro\s+build|npm\s+run\s+build[\w:-]*)")


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_site_builds_run_quietly(path: Path):
    """A site build prints every page path it writes, and listing paths come from
    titles, so a sensitive listing could be named in the log (PROJECT.md 8.1;
    sensitive-events gate). Every build in a workflow must pass --silent, and
    no build output may be piped to a file or another command."""
    for line in _code(path).splitlines():
        if not SITE_BUILD.search(line):
            continue
        assert "--silent" in line, f"site build not silent: {line.strip()}"
        assert "--verbose" not in line, line.strip()
        assert not re.search(r"[|>]|\btee\b", line), f"build output saved: {line.strip()}"
