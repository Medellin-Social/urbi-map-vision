from slowapi import Limiter
from starlette.requests import Request


def _client_ip(request: Request) -> str:
    """Real client IP behind Railway's edge proxy.

    uvicorn runs without --proxy-headers, so request.client.host is the
    proxy's own (pooled) connection, not the caller — that made every
    @limiter.limit() a silent no-op in prod (verified: rapid failed logins,
    0 blocked, should've 429'd after 5).

    Diagnosed via a temp /_debug/whoami endpoint against prod: Railway's
    X-Forwarded-For is "<real_client_ip>, <railway_internal_edge_ip>" — the
    SECOND value rotates per request across Railway's edge PoPs (seen both
    "yul1" and "mia1" across two calls), which is why a first attempted fix
    using the LAST XFF value never accumulated hits. X-Real-IP matches the
    FIRST XFF value and is simpler — use that. Both are trustworthy: Railway
    overwrites (not appends to) client-supplied X-Real-IP/X-Forwarded-For at
    its edge — confirmed by sending spoofed values and seeing them replaced
    with the real ones.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_client_ip)
