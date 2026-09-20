"""FastAPI surface: /health, /plan-week, /suggest-substitution, /chat.

Long-lived objects -- the HTTP client, the catalog cache, the conversation
store, the Anthropic client -- are built once in the lifespan handler and hung
on `app.state`. None of them is a module global, so two apps in one process (a
test and a server, say) do not share a catalog or a conversation.

The Anthropic client is constructed with NO ARGUMENTS. Credentials resolve from
the environment inside the SDK; there is no key parameter to thread through and
none to accidentally log.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Any, AsyncIterator

import anthropic
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .api_client import ApiError, RotisserieClient
from .catalog import CatalogCache
from .config import Settings, get_settings
from .conversations import ConversationStore
from .errors import (
    MISSING_CREDENTIALS_BODY,
    describe_anthropic_error,
    describe_api_error,
    has_credentials,
)
from .planner import default_start, plan_week
from .prompts import build_system_blocks, today_preamble
from .substitutions import (
    DEFAULT_MAX_CANDIDATES,
    IngredientLookupError,
    load_recipe_context,
    suggest_substitution,
)
from .tools import (
    ALL_TOOLS,
    READ_TOOLS,
    ToolContext,
    WriteGate,
    reset_tool_context,
    set_tool_context,
)


# ---------------------------------------------------------------------------
# request / response models
# ---------------------------------------------------------------------------
class PlanWeekRequest(BaseModel):
    constraints: str = Field(
        description="The household's constraints in prose.",
        examples=[
            "easy dinners, nothing we've had in two weeks, Friday is pizza night"
        ],
    )
    starts_on: date | None = Field(
        default=None, description="First day. Defaults to the next Monday."
    )
    days: int = Field(default=7, ge=1, le=31)
    exclude_cooked_within_days: int = Field(default=14, ge=0, le=365)
    meal_slots: list[str] = Field(default_factory=lambda: ["dinner"])
    refresh_catalog: bool = False


class SuggestSubstitutionRequest(BaseModel):
    recipe_id: str = Field(description="The recipe they are cooking, by id.")
    ingredient: str = Field(
        min_length=1,
        description="The ingredient to replace, as the user named it.",
        examples=["buttermilk"],
    )
    reason: str | None = Field(
        default=None,
        description="Why, in their own words. Optional -- 'don't have any' is a reason too.",
        examples=["dairy allergy"],
    )
    max_candidates: int = Field(default=DEFAULT_MAX_CANDIDATES, ge=1, le=8)


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    # CONFIRM BEFORE WRITING. False means the write tools refuse and tell the
    # model to ask. A client sets it true only after the human has said yes.
    confirm_writes: bool = False
    refresh_catalog: bool = False


# ---------------------------------------------------------------------------
# app
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    client = RotisserieClient(settings)
    app.state.api = client
    app.state.catalog = CatalogCache(
        client,
        ttl_seconds=settings.catalog_ttl_seconds,
        history_days=settings.history_days,
        concurrency=settings.catalog_fetch_concurrency,
    )
    app.state.conversations = ConversationStore(
        ttl_seconds=settings.conversation_ttl_seconds,
        max_conversations=settings.max_conversations,
    )
    # No arguments: the SDK resolves credentials from the environment.
    app.state.anthropic = anthropic.AsyncAnthropic()
    try:
        yield
    finally:
        await client.aclose()
        await app.state.anthropic.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="Rotisserie meal-planning agent",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings or get_settings()

    # -----------------------------------------------------------------
    # health
    # -----------------------------------------------------------------
    @app.get("/health")
    async def health(request: Request) -> JSONResponse:
        state = request.app.state
        body: dict[str, Any] = {
            "status": "ok",
            "model": state.settings.anthropic_model,
            "rotisserie_api": state.settings.rotisserie_api_url,
            "api_key_mode": "set" if state.settings.internal_api_key else "open",
            "anthropic_credentials": (
                "resolved" if has_credentials(state.anthropic) else "missing"
            ),
            "conversations": await state.conversations.stats(),
        }

        # Report the dependency rather than hide it: a healthy process with an
        # unreachable API is not a healthy service.
        try:
            await state.api.health()
            body["rotisserie_api_reachable"] = True
        except ApiError as exc:
            body["status"] = "degraded"
            body["rotisserie_api_reachable"] = False
            body["rotisserie_api_error"] = f"{exc.status}: {exc.message}"
        except Exception as exc:  # network-level
            body["status"] = "degraded"
            body["rotisserie_api_reachable"] = False
            body["rotisserie_api_error"] = str(exc)

        snapshot = state.catalog.peek()
        if snapshot is not None:
            body["catalog"] = {
                "recipes": len(snapshot.recipes),
                "cooks": len(snapshot.cooks),
                "prefix_hash": snapshot.prefix_hash,
                "age_seconds": round(snapshot.age_seconds(), 1),
            }

        return JSONResponse(body, status_code=200 if body["status"] == "ok" else 503)

    # -----------------------------------------------------------------
    # plan-week -- returns a DRAFT, never saves
    # -----------------------------------------------------------------
    @app.post("/plan-week")
    async def plan_week_endpoint(
        request: Request, body: PlanWeekRequest
    ) -> JSONResponse:
        state = request.app.state
        today = date.today()
        starts_on = body.starts_on or default_start(today)
        ends_on = starts_on + timedelta(days=body.days - 1)

        try:
            snapshot = await state.catalog.get(force_refresh=body.refresh_catalog)
        except ApiError as exc:
            status, error = describe_api_error(exc)
            return JSONResponse({"error": error}, status_code=status)

        if not snapshot.recipes:
            return JSONResponse(
                {
                    "error": {
                        "kind": "empty_catalog",
                        "message": "There are no recipes to plan with.",
                    }
                },
                status_code=409,
            )

        if not has_credentials(state.anthropic):
            return JSONResponse(
                {"error": MISSING_CREDENTIALS_BODY}, status_code=503
            )

        try:
            result = await plan_week(
                state.anthropic,
                state.settings,
                snapshot,
                constraints=body.constraints,
                starts_on=starts_on,
                ends_on=ends_on,
                today=today,
                exclude_days=body.exclude_cooked_within_days,
                slots=body.meal_slots,
            )
        except anthropic.APIError as exc:
            status, error = describe_anthropic_error(exc)
            return JSONResponse({"error": error}, status_code=status)

        return JSONResponse(
            {
                "data": {
                    # The contract of this endpoint, stated in the payload.
                    "persisted": False,
                    "draft": result.draft.model_dump(),
                    "constraint_check": result.verification,
                    "next_step": (
                        "Nothing has been written. To persist this plan, have the "
                        "user confirm and then call POST /chat with "
                        "confirm_writes=true, asking to save the plan."
                    ),
                    "catalog": {
                        "recipes": result.catalog_size,
                        "cooks_in_window": result.history_size,
                        "history_days": snapshot.history_days,
                        "cached_prefix_hash": result.prefix_hash,
                    },
                    "usage": result.usage,
                }
            }
        )

    # -----------------------------------------------------------------
    # suggest-substitution -- advice about one recipe, never a write
    # -----------------------------------------------------------------
    @app.post("/suggest-substitution")
    async def suggest_substitution_endpoint(
        request: Request, body: SuggestSubstitutionRequest
    ) -> JSONResponse:
        state = request.app.state

        # No catalog snapshot anywhere on this path: the question is about ONE
        # recipe, named by id, so there is nothing for the rest of the
        # collection to contribute and no N+1 catalog build to pay for.
        try:
            context = await load_recipe_context(
                state.api, body.recipe_id, body.ingredient
            )
        except IngredientLookupError as exc:
            # A correct answer to a wrong question, not a server failure. The
            # body carries the recipe's real ingredient names so the caller can
            # fix the request without a second round trip.
            return JSONResponse({"error": exc.as_error_body()}, status_code=409)
        except ApiError as exc:
            # The recipe id here comes straight from the caller, unlike every
            # other id in this service, which comes from the catalog. A 4xx is
            # therefore the caller's, and describe_api_error's uniform 502 --
            # right when a dependency misbehaves -- would blame the wrong side.
            # The API answers 404 for a malformed id as well as an unknown one
            # (`uuidPathParam`), so its status and message pass through rather
            # than being second-guessed here.
            if exc.status in (400, 404):
                return JSONResponse(
                    {
                        "error": {
                            "kind": (
                                "recipe_not_found"
                                if exc.status == 404
                                else "invalid_recipe_id"
                            ),
                            "message": exc.message,
                            "recipe_id": body.recipe_id,
                        }
                    },
                    status_code=exc.status,
                )
            status, error = describe_api_error(exc)
            return JSONResponse({"error": error}, status_code=status)

        if not has_credentials(state.anthropic):
            return JSONResponse({"error": MISSING_CREDENTIALS_BODY}, status_code=503)

        try:
            result = await suggest_substitution(
                state.anthropic,
                state.settings,
                context,
                reason=body.reason,
                max_candidates=body.max_candidates,
            )
        except anthropic.APIError as exc:
            status, error = describe_anthropic_error(exc)
            return JSONResponse({"error": error}, status_code=status)

        return JSONResponse(
            {
                "data": {
                    # Advice, never an edit -- stated in the payload, the same
                    # way /plan-week states that its draft was not saved.
                    "persisted": False,
                    "recipe": context.full(),
                    "replacing": context.match.to_dict(),
                    "reason": body.reason,
                    "suggestion": result.answer.model_dump(),
                    "check": result.verification,
                    # The exact text the answer was derived from, so "it knew
                    # this was a cake" is checkable rather than assumed.
                    "context_shown_to_model": context.rendered,
                    "usage": result.usage,
                }
            }
        )

    # -----------------------------------------------------------------
    # chat -- SSE
    # -----------------------------------------------------------------
    @app.post("/chat")
    async def chat_endpoint(request: Request, body: ChatRequest) -> Any:
        state = request.app.state

        try:
            snapshot = await state.catalog.get(force_refresh=body.refresh_catalog)
        except ApiError as exc:
            status, error = describe_api_error(exc)
            return JSONResponse({"error": error}, status_code=status)

        if not has_credentials(state.anthropic):
            return JSONResponse({"error": MISSING_CREDENTIALS_BODY}, status_code=503)

        conversation = await state.conversations.get_or_create(body.conversation_id)

        async def event_stream() -> AsyncIterator[bytes]:
            def sse(event: str, payload: dict[str, Any]) -> bytes:
                return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n".encode()

            yield sse("start", {"conversation_id": conversation.id})

            # One turn at a time per conversation; see conversations.py.
            async with conversation.lock:
                ctx = ToolContext(
                    client=state.api,
                    catalog=state.catalog,
                    # `suggest_substitution` asks the model a question of its
                    # own; every other tool ignores these.
                    anthropic_client=state.anthropic,
                    settings=state.settings,
                    gate=WriteGate(allowed=body.confirm_writes),
                )
                token = set_tool_context(ctx)

                # Volatile context goes in the user turn, after the cache
                # breakpoint -- never in the cached system prefix.
                user_content = f"{today_preamble()}\n\n{body.message}"
                messages = [*conversation.messages, {"role": "user", "content": user_content}]

                # Write tools are only offered when the human has confirmed.
                # The gate in tools.py is the backstop; this is the front door.
                tools = ALL_TOOLS if body.confirm_writes else READ_TOOLS

                try:
                    runner = state.anthropic.beta.messages.tool_runner(
                        model=state.settings.anthropic_model,
                        max_tokens=state.settings.streaming_max_tokens,
                        thinking={"type": "adaptive", "display": "summarized"},
                        output_config={"effort": state.settings.effort},
                        system=build_system_blocks(snapshot),
                        tools=tools,
                        messages=messages,
                        max_iterations=state.settings.max_tool_iterations,
                        stream=True,
                    )

                    final_usage: dict[str, Any] = {}
                    async for stream in runner:
                        async for event in stream:
                            if event.type == "content_block_start":
                                if event.content_block.type == "tool_use":
                                    yield sse(
                                        "tool_use",
                                        {"name": event.content_block.name},
                                    )
                            elif event.type == "content_block_delta":
                                if event.delta.type == "text_delta":
                                    yield sse("token", {"text": event.delta.text})
                                elif event.delta.type == "thinking_delta":
                                    yield sse("thinking", {"text": event.delta.thinking})

                        message = await stream.get_final_message()
                        messages.append(
                            {"role": "assistant", "content": message.content}
                        )
                        tool_response = runner.generate_tool_call_response()
                        if tool_response is not None:
                            messages.append(tool_response)
                            for block in tool_response["content"]:
                                yield sse(
                                    "tool_result",
                                    {
                                        "tool_use_id": block.get("tool_use_id"),
                                        "content": block.get("content"),
                                    },
                                )
                        final_usage = {
                            "input_tokens": message.usage.input_tokens,
                            "output_tokens": message.usage.output_tokens,
                            "cache_creation_input_tokens": getattr(
                                message.usage, "cache_creation_input_tokens", None
                            ),
                            "cache_read_input_tokens": getattr(
                                message.usage, "cache_read_input_tokens", None
                            ),
                        }

                    conversation.messages = messages
                    await state.conversations.save(conversation)

                    yield sse(
                        "done",
                        {
                            "conversation_id": conversation.id,
                            "writes_allowed": body.confirm_writes,
                            "writes_performed": ctx.writes,
                            "tool_calls": ctx.calls,
                            "usage": final_usage,
                            "cached_prefix_hash": snapshot.prefix_hash,
                        },
                    )
                except anthropic.APIError as exc:
                    status, error = describe_anthropic_error(exc)
                    yield sse("error", {"status": status, **error})
                except ApiError as exc:
                    status, error = describe_api_error(exc)
                    yield sse("error", {"status": status, **error})
                finally:
                    reset_tool_context(token)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/catalog")
    async def catalog_endpoint(request: Request, refresh: bool = False) -> JSONResponse:
        """The exact cached prefix, for debugging cache behaviour and prompts."""
        state = request.app.state
        try:
            snapshot = await state.catalog.get(force_refresh=refresh)
        except ApiError as exc:
            status, error = describe_api_error(exc)
            return JSONResponse({"error": error}, status_code=status)

        blocks = build_system_blocks(snapshot)
        return JSONResponse(
            {
                "data": {
                    "recipes": len(snapshot.recipes),
                    "cooks": len(snapshot.cooks),
                    "history_days": snapshot.history_days,
                    "prefix_hash": snapshot.prefix_hash,
                    "prefix_chars": len(blocks[0]["text"]),
                    "cache_control": blocks[0]["cache_control"],
                    "age_seconds": round(snapshot.age_seconds(), 1),
                    "system_prefix": blocks[0]["text"],
                }
            }
        )

    return app


app = create_app()
