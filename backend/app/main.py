from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from . import config, models  # noqa: F401
from .database import Base, engine
from .routes import geo, ai, trips, tools
from .services.http import UpstreamError


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="TravelBuddy API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[config.FRONTEND_ORIGIN, "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
for r in (geo.router, ai.router, trips.router, tools.router):
    app.include_router(r)


@app.exception_handler(UpstreamError)
async def upstream_error(_request, exc: UpstreamError):
    return JSONResponse(status_code=502, content={"detail": exc.message, "service": exc.service})
