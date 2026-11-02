import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ.setdefault("OPENROUTER_API_KEY", "")

import pytest  # noqa: E402


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    from app import cache
    from app.main import app
    cache.clear()
    with TestClient(app) as c:   # runs lifespan -> creates tables
        yield c
