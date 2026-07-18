import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
