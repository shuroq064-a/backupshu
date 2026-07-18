import os

from fastapi import FastAPI, Request, Response

import dbmodels
from database import engine


dbmodels.Base.metadata.create_all(bind=engine)



if __package__:
    from .routers import unified_auth, admin, workers, users, bookings, userinput, intent, marketplace, services, location_permission, assistant
else:
    from routers import unified_auth, admin, workers, users, bookings, userinput, intent, marketplace, services, location_permission, assistant

app = FastAPI(title="ShuroqX API", version="1.0.0")


def get_cors_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "*")
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def resolve_cors_origin(origin: str | None) -> str:
    """Reflect an allowed requesting Origin, or "*" when unrestricted."""
    if not origin:
        return "*"
    allowed = get_cors_origins()
    if "*" in allowed or origin in allowed:
        return origin
    return allowed[0] if allowed else "*"


@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    """CORS for both HTTP and WebSocket.

    Starlette's CORSMiddleware rejects WebSocket upgrade handshakes with a 403,
    so we handle CORS ourselves: HTTP responses get the standard CORS headers
    (plus OPTIONS preflight handling), while WebSocket upgrades are passed
    straight through to the endpoint, which echoes the CORS headers on accept().
    """
    origin = request.headers.get("origin")
    if request.scope.get("type") == "websocket":
        return await call_next(request)

    if request.method == "OPTIONS":
        response = Response(status_code=204)
    else:
        response = await call_next(request)

    allowed = resolve_cors_origin(origin)
    response.headers["Access-Control-Allow-Origin"] = allowed
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Vary"] = "Origin"
    return response

@app.get("/")
def greet():
    return {"message": "ShuroqX backend running successfully"}


# Register all routers
app.include_router(unified_auth.router)   # /users/register, /login, /oauth-login, /switch-to-specialist
app.include_router(users.router)          # /users/me, /users/change-password
app.include_router(workers.router)        # /workers/*
app.include_router(admin.router)          # /admin/*
app.include_router(bookings.router) 
app.include_router(userinput.router)      # /users/{id}/bookings, /bookings/{id}
app.include_router(intent.router)
app.include_router(marketplace.router)
app.include_router(services.router)
app.include_router(location_permission.router)  # /location-permission/*
app.include_router(assistant.router)            # /assistant/chat (LLM chat brain)
