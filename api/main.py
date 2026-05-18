import asyncio
import os
import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from api.db import create_pool, close_pool, get_pool
from api.limiter import limiter
from api.routers import auth, barrios, calculadora, favoritos, historial, oportunidades, stats, usuario

logger = structlog.get_logger()

_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
]

def _build_origins() -> list[str]:
    extra = os.getenv("CORS_ORIGINS", "")
    extras = [o.strip() for o in extra.split(",") if o.strip()]
    return _LOCAL_ORIGINS + extras


async def _connect_with_retry() -> None:
    for attempt in range(1, 11):
        try:
            await create_pool()
            return
        except Exception as exc:
            print(f"[DB] attempt {attempt}/10 failed: {exc}", flush=True)
            if attempt == 10:
                print("[DB] giving up after 10 attempts", flush=True)
                return
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _connect_with_retry()
    try:
        pool = get_pool()
        await pool.execute(
            "DELETE FROM token_blacklist WHERE created_at < NOW() - INTERVAL '30 days'"
        )
    except Exception as exc:
        print(f"[startup] token_blacklist cleanup skipped: {exc}", flush=True)
    yield
    await close_pool()


app = FastAPI(
    title="Urbidata API",
    description="Motor de decisión de inversión inmobiliaria — Valle de Aburrá",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration=round(time.time() - start, 3),
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_origins(),
    allow_origin_regex=r"https://.*\.(lovable\.app|lovableproject\.com|up\.railway\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/v1/auth",          tags=["auth"])
app.include_router(barrios.router,       prefix="/api/v1/barrios",        tags=["barrios"])
app.include_router(calculadora.router,   prefix="/api/v1/calculadora",    tags=["calculadora"])
app.include_router(oportunidades.router, prefix="/api/v1/oportunidades",  tags=["oportunidades"])
app.include_router(usuario.router,       prefix="/api/v1/usuario",        tags=["usuario"])
app.include_router(favoritos.router,     prefix="/api/v1/favoritos",      tags=["favoritos"])
app.include_router(historial.router,     prefix="/api/v1/historial",      tags=["historial"])
app.include_router(stats.router,         prefix="/api/v1/stats",           tags=["stats"])


@app.get("/health", tags=["meta"])
async def health():
    try:
        pool = get_pool()
        db_ok = pool is not None
    except RuntimeError:
        db_ok = False
    return {"status": "ok", "version": "1.0.0", "db": db_ok}
