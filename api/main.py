import asyncio
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from api.db import create_pool, close_pool, get_pool
from api.limiter import limiter
from api.routers import admin, auth, barrios, calculadora, favoritos, historial, listings, oportunidades, stats, usuario

# Sentry — only active when SENTRY_DSN is set (optional in local/test)
_SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if _SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.asyncio import AsyncioIntegration

    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        integrations=[FastApiIntegration(), AsyncioIntegration()],
        traces_sample_rate=0.1,
        environment=os.getenv("RAILWAY_ENVIRONMENT", "development"),
        send_default_pii=False,
    )

logger = structlog.get_logger()

_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
    "https://urbidata.co",
    "https://www.urbidata.co",
    "https://medellinsocial.com",
    "https://www.medellinsocial.com",
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
app.include_router(listings.router,      prefix="/api/v1/listings",       tags=["listings"])
app.include_router(calculadora.router,   prefix="/api/v1/calculadora",    tags=["calculadora"])
app.include_router(oportunidades.router, prefix="/api/v1/oportunidades",  tags=["oportunidades"])
app.include_router(usuario.router,       prefix="/api/v1/usuario",        tags=["usuario"])
app.include_router(favoritos.router,     prefix="/api/v1/favoritos",      tags=["favoritos"])
app.include_router(historial.router,     prefix="/api/v1/historial",      tags=["historial"])
app.include_router(stats.router,         prefix="/api/v1/stats",           tags=["stats"])
app.include_router(admin.router,         prefix="/api/v1/admin",           tags=["admin"])


@app.get("/", tags=["meta"])
async def root():
    return {"status": "ok"}


# ── Admin panel (SPA) ─────────────────────────────────────────────────────────
_ADMIN_DIST = Path(__file__).parent / "admin_dist"

if _ADMIN_DIST.exists():
    _ADMIN_ASSETS = _ADMIN_DIST / "assets"
    if _ADMIN_ASSETS.exists():
        app.mount("/admin/assets", StaticFiles(directory=str(_ADMIN_ASSETS)), name="admin-assets")

    @app.get("/admin", include_in_schema=False)
    @app.get("/admin/{full_path:path}", include_in_schema=False)
    async def serve_admin(full_path: str = ""):
        return FileResponse(str(_ADMIN_DIST / "index.html"))


@app.get("/health", tags=["meta"])
async def health():
    try:
        pool = get_pool()
        db_ok = pool is not None
    except RuntimeError:
        db_ok = False
    return {"status": "ok", "version": "1.0.0", "db": db_ok}
