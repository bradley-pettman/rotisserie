"""Runtime configuration, read once from the environment.

Anthropic credentials are deliberately absent from this file. The SDK resolves
them itself (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or an `ant auth
login` profile) and the client is constructed with no arguments, so there is
no key to mislay here and none to hardcode.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- The TypeScript JSON API: the ONLY way this service reaches data. ---
    rotisserie_api_url: str = "http://localhost:5173"

    # Shared secret for /api/*. Must match INTERNAL_API_KEY on the TS side.
    # Unset means the API is open, which is the local-development mode.
    internal_api_key: str | None = None

    # --- This service's OWN front door ---
    #
    # Distinct from `internal_api_key`, which is what this service SENDS
    # upstream. This one is what it REQUIRES from its own callers, and it
    # exists because without it the service is a confused deputy: it holds the
    # upstream key and the Anthropic credentials, so anyone who can reach this
    # port can write cooks and meal plans into Postgres, and spend the
    # operator's model budget, without ever holding a secret themselves. An
    # unauthenticated agent silently voids INTERNAL_API_KEY on the TS side.
    #
    # Unlike the TS side's historical behaviour, unset does NOT mean open:
    # `allow_unauthenticated` has to be set as well, so the insecure mode is
    # something an operator chooses rather than something they forget. See
    # `require_agent_auth` in main.py.
    agent_api_key: str | None = None
    allow_unauthenticated: bool = False

    api_timeout_seconds: float = 30.0

    # --- Model ---
    # Exact id, no dated suffix.
    anthropic_model: str = "claude-opus-5"
    # `effort` rides inside output_config, not at the top level.
    effort: str = "medium"
    # 16000 for non-streaming; streaming paths are given more room.
    max_tokens: int = 16_000
    streaming_max_tokens: int = 32_000

    # --- Catalog prefix ---
    # A snapshot is reused verbatim for this long, so repeated requests send
    # byte-identical prefixes and actually hit the prompt cache.
    catalog_ttl_seconds: float = 300.0
    history_days: int = 28
    # Concurrency for the per-recipe detail fetches the catalog needs (see
    # catalog.py for why those fetches exist at all).
    catalog_fetch_concurrency: int = 8

    # --- Conversations ---
    conversation_ttl_seconds: float = 3600.0
    max_conversations: int = 500
    max_tool_iterations: int = 12


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
