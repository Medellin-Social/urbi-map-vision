from slowapi import Limiter
from starlette.requests import Request


def _client_ip(request: Request) -> str:
    """Real client IP behind Railway's edge proxy.

    uvicorn runs without --proxy-headers, so request.client.host is the
    proxy's own (pooled/rotating) connection, not the caller — that made
    every @limiter.limit() a silent no-op in prod (verified: 7 rapid failed
    logins, 0 blocked, should've 429'd after 5). X-Forwarded-For's LAST hop
    is what Railway's own edge appended and can't be spoofed by the client
    sending a fake earlier value in the chain — taking the first value
    instead would let an attacker rotate a fake IP per request to dodge the
    limit entirely.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_client_ip)
