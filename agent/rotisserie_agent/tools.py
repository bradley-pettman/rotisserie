"""The tools Claude can call. Each one is a thin wrapper over an HTTP call.

Every tool here is a wrapper and nothing more: no SQL, no validation, no
business rules. Anything a tool "decides" would be a second implementation of a
rule the TypeScript API already owns.

`suggest_substitution` is the one tool that is not a wrapper over a single HTTP
call -- it reads a recipe and then asks the model a question of its own. It is
still not a second implementation of anything: it delegates to
`substitutions.suggest_substitution`, the same function `POST
/suggest-substitution` calls, so the conversational answer and the endpoint's
answer cannot drift apart. It is a read, and it is offered on every chat turn.

Schemas are generated from the signatures and docstrings by `@beta_async_tool`,
so the `Args:` sections below are the parameter descriptions the model actually
reads. They are documentation and interface at once -- edit them as such.

CONFIRM BEFORE WRITING is enforced here, in code, not only in the system
prompt. `save_meal_plan` and `log_cook` check a `WriteGate` that is closed
unless the caller opened it, so a model that decides to save unprompted gets a
refusal back as a tool result and has to go ask. The `/plan-week` path does not
pass the write tools at all -- the capability is simply absent there, which is
the strongest version of the same rule.
"""
from __future__ import annotations

import json
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

import anthropic
from anthropic import beta_async_tool
from pydantic import BaseModel, Field, ValidationError

from . import substitutions
from .api_client import ApiError, RotisserieClient
from .catalog import CatalogCache
from .config import Settings
from .errors import describe_anthropic_error, has_credentials

MealSlot = Literal["breakfast", "lunch", "dinner", "snack"]


class WriteBlocked(RuntimeError):
    """Raised inside a tool when the write gate is shut."""


@dataclass
class WriteGate:
    """Whether this turn is allowed to persist anything.

    `reason` is handed back to the model so it knows what to do about it --
    namely, ask the human and let them re-send with the gate open.
    """

    allowed: bool = False
    reason: str = (
        "Writes are not confirmed for this turn. Show the user exactly what you "
        "intend to save and ask them to confirm. Do not call this tool again "
        "until they have said yes."
    )


@dataclass
class ToolContext:
    """Request-scoped dependencies for the tool functions.

    Carried in a ContextVar rather than module globals so concurrent requests
    cannot see each other's client, gate or write log.
    """

    client: RotisserieClient
    catalog: CatalogCache
    # Only `suggest_substitution` needs these, being the one tool that asks the
    # model something. Optional so every other tool can still be driven from a
    # script or a test with nothing but an API client.
    anthropic_client: anthropic.AsyncAnthropic | None = None
    settings: Settings | None = None
    gate: WriteGate = field(default_factory=WriteGate)
    writes: list[dict[str, Any]] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)


_context: ContextVar[ToolContext | None] = ContextVar("tool_context", default=None)


def set_tool_context(ctx: ToolContext) -> Any:
    return _context.set(ctx)


def reset_tool_context(token: Any) -> None:
    _context.reset(token)


def current_context() -> ToolContext:
    ctx = _context.get()
    if ctx is None:
        raise RuntimeError("Tool called outside of a request context")
    return ctx


def _ok(payload: Any) -> str:
    return json.dumps(payload, default=str)


def _err(message: str) -> str:
    return json.dumps({"error": message})


# ---------------------------------------------------------------------------
# read tools
# ---------------------------------------------------------------------------
@beta_async_tool
async def search_recipes(
    search: str | None = None,
    tags: list[str] | None = None,
    limit: int = 50,
) -> str:
    """Search the household's recipe collection.

    Returns COMPACT rows -- id, name, tags and times only, never ingredients or
    instructions. The full catalog is already in your system prompt, so reach
    for this only to re-check a detail or to filter a long list. Call
    `get_recipe` when you actually need a recipe's contents.

    Args:
        search: Case-insensitive substring matched against the recipe name. Omit to match all.
        tags: Only recipes carrying ALL of these tags, e.g. ["quick", "vegetarian"].
        limit: Maximum number of rows to return.
    """
    ctx = current_context()
    ctx.calls.append({"tool": "search_recipes", "search": search, "tags": tags})
    try:
        rows = await ctx.client.list_recipes(search=search, tags=tags)
    except ApiError as exc:
        return _err(exc.as_tool_result())

    # The list endpoint does not return tags, so compact rows are assembled
    # from the catalog snapshot, which already paid for the detail reads.
    snapshot = await ctx.catalog.get()
    by_id = snapshot.by_id()
    last_cooked = snapshot.last_cooked()

    out: list[dict[str, Any]] = []
    for row in rows[: max(1, limit)]:
        recipe = by_id.get(row["id"])
        compact = (
            recipe.to_compact_row()
            if recipe
            else {
                "id": row["id"],
                "name": row["name"],
                "tags": [],
                "prepTimeMinutes": row.get("prepTimeMinutes"),
                "cookTimeMinutes": row.get("cookTimeMinutes"),
                "servings": row.get("servings"),
            }
        )
        compact["lastCookedOn"] = last_cooked.get(row["id"])
        out.append(compact)

    return _ok({"count": len(out), "recipes": out})


@beta_async_tool
async def get_recipe(recipe_id: str) -> str:
    """Fetch one full recipe: ingredients, instructions, tags and times.

    Args:
        recipe_id: The recipe's UUID, copied exactly from the catalog.
    """
    ctx = current_context()
    ctx.calls.append({"tool": "get_recipe", "recipe_id": recipe_id})
    try:
        return _ok(await ctx.client.get_recipe(recipe_id))
    except ApiError as exc:
        return _err(exc.as_tool_result())


@beta_async_tool
async def get_cooking_history(days: int = 14) -> str:
    """What the household actually cooked recently, newest first.

    This is the tool that answers "nothing we've had in the last two weeks".
    Leftovers are included, because eating a dish again still counts against
    variety. Match on `recipeId`, not on the label, since labels are snapshots
    of a name at the time of cooking.

    Args:
        days: Size of the lookback window in days. 14 for a two-week rule.
    """
    ctx = current_context()
    ctx.calls.append({"tool": "get_cooking_history", "days": days})
    try:
        cooks = await ctx.client.get_cooking_history(days)
    except ApiError as exc:
        return _err(exc.as_tool_result())

    cooked_ids = sorted({c["recipeId"] for c in cooks if c.get("recipeId")})
    return _ok(
        {
            "days": days,
            "count": len(cooks),
            "cooks": cooks,
            "recipeIdsCookedInWindow": cooked_ids,
        }
    )


@beta_async_tool
async def suggest_substitution(
    recipe_id: str,
    ingredient: str,
    reason: str | None = None,
) -> str:
    """Work out what to use instead of one ingredient IN A PARTICULAR RECIPE.

    This is the tool for "I'm out of buttermilk", "she can't eat dairy" and
    "can we make this less spicy". Do not answer those from memory: it reads
    the recipe's real ingredients and instructions first, because what an
    ingredient is doing in a cake is not what it is doing in a dressing, and
    both the swap and the amount depend on that.

    Returns the amount to use, one line on what each swap changes about the
    result, and a caveat where one is warranted. It reads and changes nothing.

    Args:
        recipe_id: The recipe's UUID, copied exactly from the catalog.
        ingredient: The ingredient to replace, as the user named it, e.g. "buttermilk".
        reason: Why they are replacing it, in their own words -- "dairy allergy", "don't have any", "want it less spicy". Omit it when they did not say.
    """
    ctx = current_context()
    ctx.calls.append(
        {
            "tool": "suggest_substitution",
            "recipe_id": recipe_id,
            "ingredient": ingredient,
            "reason": reason,
        }
    )

    if ctx.anthropic_client is None or ctx.settings is None:
        return _err(
            "Substitutions are unavailable: this request was built without a "
            "model client."
        )

    # /chat already refuses the whole turn when nothing resolved, so this is a
    # backstop for any other caller. It is here because the SDK raises a bare
    # TypeError from inside request building when there is no credential --
    # not an APIError, so it would sail past the handler below and take the
    # conversation down instead of failing as one tool result.
    if not has_credentials(ctx.anthropic_client):
        return _err(
            "Substitutions are unavailable: this service has no Anthropic "
            "credentials. Set ANTHROPIC_API_KEY in its environment."
        )

    try:
        context = await substitutions.load_recipe_context(
            ctx.client, recipe_id, ingredient
        )
    except substitutions.IngredientLookupError as exc:
        # The message carries the recipe's real ingredient names, so the model
        # can ask which one they meant instead of guessing.
        return _err(exc.as_tool_result())
    except ApiError as exc:
        return _err(exc.as_tool_result())

    try:
        result = await substitutions.suggest_substitution(
            ctx.anthropic_client, ctx.settings, context, reason=reason
        )
    except anthropic.APIError as exc:
        # Typed and most-specific-first, through the one mapping in errors.py.
        # A failed nested call is a tool failure, not a dead conversation.
        _, error = describe_anthropic_error(exc)
        return _err(error["message"])

    return _ok(
        {
            "recipe": context.summary(),
            "replacing": context.match.to_dict(),
            "suggestion": result.answer.model_dump(),
            "check": result.verification,
        }
    )


# ---------------------------------------------------------------------------
# write tools -- gated
# ---------------------------------------------------------------------------
class PlanItem(BaseModel):
    """One meal in a plan. Either a recipe or free text, never neither."""

    planned_on: str = Field(description="Calendar day, YYYY-MM-DD.")
    meal_slot: MealSlot = Field(
        default="dinner", description="breakfast, lunch, dinner or snack."
    )
    recipe_id: str | None = Field(
        default=None, description="Recipe UUID copied exactly from the catalog, or null."
    )
    custom_text: str | None = Field(
        default=None,
        description="Free text for a meal with no recipe, e.g. 'Pizza night'. Required when recipe_id is null.",
    )
    notes: str | None = Field(default=None, description="Optional note for this meal.")
    sort_order: int = Field(default=0, description="Ordering within the day and slot.")


@beta_async_tool
async def save_meal_plan(
    starts_on: str,
    ends_on: str,
    items: list[PlanItem],
    name: str | None = None,
) -> str:
    """PERSIST a meal plan and its meals. Requires the user's explicit confirmation.

    This writes to the database. Only call it after the user has seen the plan
    and said yes in this conversation. Proposing a plan is not saving one.

    Args:
        starts_on: First day of the plan, YYYY-MM-DD.
        ends_on: Last day of the plan, YYYY-MM-DD. Must be on or after starts_on.
        items: The meals to save.
        name: Optional plan name, e.g. "Week of 21 September".
    """
    ctx = current_context()
    ctx.calls.append({"tool": "save_meal_plan", "starts_on": starts_on, "items": len(items)})

    if not ctx.gate.allowed:
        return _err(ctx.gate.reason)

    # The tool runner hands over `PlanItem` instances, but this function is
    # also called directly (tests, scripts), where plain dicts are natural.
    # Validate both through the same model so the payload is built from one
    # shape -- and so a malformed item is a clear ValidationError rather than
    # an AttributeError halfway through the comprehension.
    try:
        parsed = [
            item if isinstance(item, PlanItem) else PlanItem.model_validate(item)
            for item in items
        ]
    except ValidationError as exc:
        return _err(f"Invalid plan item: {exc.errors()}")

    payload = {
        "name": name,
        "startsOn": starts_on,
        "endsOn": ends_on,
        "items": [
            {
                "recipeId": item.recipe_id,
                "customText": item.custom_text,
                "plannedOn": item.planned_on,
                "mealSlot": item.meal_slot,
                "sortOrder": item.sort_order,
                "notes": item.notes,
            }
            for item in parsed
        ],
    }

    try:
        plan = await ctx.client.create_meal_plan(payload)
    except ApiError as exc:
        return _err(exc.as_tool_result())

    ctx.writes.append({"type": "meal_plan", "id": plan["id"]})
    return _ok({"saved": True, "mealPlan": plan})


@beta_async_tool
async def log_cook(
    cooked_on: str,
    recipe_id: str | None = None,
    label: str | None = None,
    meal_slot: MealSlot = "dinner",
    servings_made: int | None = None,
    notes: str | None = None,
    is_leftovers: bool = False,
) -> str:
    """RECORD that a meal was actually cooked. Requires the user's explicit confirmation.

    Cooking history is append-only fact and cannot be edited afterwards, so
    confirm with the user before calling this. Supply either a recipe_id or a
    label; with a recipe_id and no label the API snapshots the recipe's current
    name for you.

    Args:
        cooked_on: The calendar day it was cooked, YYYY-MM-DD.
        recipe_id: Recipe UUID if this was a recipe from the collection.
        label: Free text for takeout or an improvised meal. Required when recipe_id is null.
        meal_slot: breakfast, lunch, dinner or snack.
        servings_made: How many servings were produced.
        notes: Optional note.
        is_leftovers: True when this was eating an earlier cook again rather than making it fresh.
    """
    ctx = current_context()
    ctx.calls.append({"tool": "log_cook", "cooked_on": cooked_on, "recipe_id": recipe_id})

    if not ctx.gate.allowed:
        return _err(ctx.gate.reason)

    payload: dict[str, Any] = {
        "recipeId": recipe_id,
        "cookedOn": cooked_on,
        "mealSlot": meal_slot,
        "servingsMade": servings_made,
        "notes": notes,
        "isLeftovers": is_leftovers,
    }
    # Absent label + recipeId asks the API to snapshot the name itself.
    if label:
        payload["label"] = label

    try:
        cook = await ctx.client.log_cook(payload)
    except ApiError as exc:
        return _err(exc.as_tool_result())

    ctx.writes.append({"type": "cook", "id": cook["id"]})
    return _ok({"saved": True, "cook": cook})


# Deterministic order: the tool list renders BEFORE the system prompt, so a
# reordering would invalidate the cached prefix on every request.
READ_TOOLS = [search_recipes, get_recipe, get_cooking_history, suggest_substitution]
WRITE_TOOLS = [save_meal_plan, log_cook]
ALL_TOOLS = [*READ_TOOLS, *WRITE_TOOLS]
