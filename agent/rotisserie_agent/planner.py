"""`plan_week`: prose constraints in, a structured DRAFT plan out.

IT DOES NOT SAVE. That is the whole posture of this endpoint, and it is
enforced by capability rather than by instruction: the request carries no write
tools, so there is no `save_meal_plan` for the model to reach for even if it
decided to. Persisting the draft is a separate, explicit act -- `save_meal_plan`
from a chat turn, once the human has said yes.

There is also no retrieval step. The catalog and the cooking history are
already in the cached system prefix, so this is one request: the model can see
every candidate at once and is doing constraint satisfaction, not search.

The draft comes back through `output_config.format`, so the shape is
guaranteed rather than parsed hopefully out of prose. It is then checked
AGAINST THE SAME SNAPSHOT the model was shown -- `verify_draft` re-derives the
recently-cooked set and reports any violation. That check is not decoration:
"nothing we've had in two weeks" is the feature, and a claim that it held
should be verifiable without reading the model's explanation.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import anthropic
from pydantic import BaseModel, Field

from .catalog import CatalogSnapshot
from .config import Settings
from .prompts import build_system_blocks, today_preamble

MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"]


class DraftItem(BaseModel):
    planned_on: str
    meal_slot: str
    recipe_id: str | None = None
    recipe_name: str | None = None
    custom_text: str | None = None
    notes: str | None = None


class DraftPlan(BaseModel):
    name: str | None = None
    starts_on: str
    ends_on: str
    items: list[DraftItem] = Field(default_factory=list)
    reasoning: str = ""
    excluded_recently_cooked: list[str] = Field(default_factory=list)


# All properties are listed in `required` and additionalProperties is false, as
# structured outputs expect; optionality is expressed with nullable types.
DRAFT_SCHEMA: dict[str, Any] = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "name",
            "starts_on",
            "ends_on",
            "items",
            "reasoning",
            "excluded_recently_cooked",
        ],
        "properties": {
            "name": {
                "type": ["string", "null"],
                "description": "A short name for the plan, or null.",
            },
            "starts_on": {"type": "string", "description": "First day, YYYY-MM-DD."},
            "ends_on": {"type": "string", "description": "Last day, YYYY-MM-DD."},
            "items": {
                "type": "array",
                "description": "One entry per planned meal.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "planned_on",
                        "meal_slot",
                        "recipe_id",
                        "recipe_name",
                        "custom_text",
                        "notes",
                    ],
                    "properties": {
                        "planned_on": {"type": "string"},
                        "meal_slot": {"type": "string", "enum": MEAL_SLOTS},
                        "recipe_id": {
                            "type": ["string", "null"],
                            "description": "UUID copied EXACTLY from the catalog, or null for a free-text meal.",
                        },
                        "recipe_name": {
                            "type": ["string", "null"],
                            "description": "The catalog name matching recipe_id, for the human reading the draft.",
                        },
                        "custom_text": {
                            "type": ["string", "null"],
                            "description": "Free text when there is no recipe, e.g. 'Pizza night'.",
                        },
                        "notes": {"type": ["string", "null"]},
                    },
                },
            },
            "reasoning": {
                "type": "string",
                "description": "Two or three sentences on how the constraints were met.",
            },
            "excluded_recently_cooked": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Names of catalog recipes deliberately left out because they were cooked too recently.",
            },
        },
    },
}


@dataclass
class PlanWeekResult:
    draft: DraftPlan
    verification: dict[str, Any]
    usage: dict[str, Any]
    prefix_hash: str
    catalog_size: int
    history_size: int


def default_start(today: date) -> date:
    """The next Monday; today if today is Monday."""
    return today + timedelta(days=(7 - today.weekday()) % 7)


def _build_request_text(
    constraints: str,
    starts_on: date,
    ends_on: date,
    today: date,
    exclude_days: int,
    slots: list[str],
) -> str:
    days = [
        (starts_on + timedelta(days=i)).isoformat()
        for i in range((ends_on - starts_on).days + 1)
    ]
    day_lines = "\n".join(
        f"- {d} ({date.fromisoformat(d).strftime('%A')})" for d in days
    )
    return (
        f"{today_preamble(today)}\n\n"
        f"Plan these days, one meal per day in the {', '.join(slots)} slot"
        f"{'s' if len(slots) > 1 else ''}:\n{day_lines}\n\n"
        f"The household's constraints, in their words:\n\"{constraints}\"\n\n"
        f"Hard rule for this request: do NOT plan any recipe whose id appears in "
        f"the cooking history on or after "
        f"{(today - timedelta(days=exclude_days)).isoformat()} "
        f"({exclude_days} days before today). Copy recipe ids EXACTLY from the "
        f"catalog. Use custom_text with a null recipe_id for any meal that is "
        f"not a recipe from the collection.\n\n"
        f"Return the draft plan. This is a PROPOSAL -- it will be shown to the "
        f"household before anything is saved."
    )


def verify_draft(
    draft: DraftPlan,
    snapshot: CatalogSnapshot,
    *,
    today: date,
    exclude_days: int,
    starts_on: date,
    ends_on: date,
) -> dict[str, Any]:
    """Check the model's draft against the very rows it was shown.

    Independent of anything the model said about its own work: the exclusion
    set is re-derived here from the snapshot's cooking history.
    """
    by_id = snapshot.by_id()
    recent = snapshot.recently_cooked_recipe_ids(exclude_days, today=today)
    last_cooked = snapshot.last_cooked()

    unknown_ids: list[str] = []
    violations: list[dict[str, Any]] = []
    out_of_range: list[str] = []
    empty_items: list[int] = []

    for index, item in enumerate(draft.items):
        if item.planned_on < starts_on.isoformat() or item.planned_on > ends_on.isoformat():
            out_of_range.append(item.planned_on)

        if item.recipe_id is None:
            if not (item.custom_text and item.custom_text.strip()):
                empty_items.append(index)
            continue

        if item.recipe_id not in by_id:
            unknown_ids.append(item.recipe_id)
            continue

        if item.recipe_id in recent:
            violations.append(
                {
                    "recipe_id": item.recipe_id,
                    "recipe_name": by_id[item.recipe_id].name,
                    "planned_on": item.planned_on,
                    "last_cooked_on": last_cooked.get(item.recipe_id),
                }
            )

    return {
        "exclusion_window_days": exclude_days,
        "exclusion_cutoff": (today - timedelta(days=exclude_days)).isoformat(),
        "recipes_excluded_by_rule": sorted(
            by_id[rid].name for rid in recent if rid in by_id
        ),
        "recently_cooked_recipes_in_plan": violations,
        "respects_recency_rule": not violations,
        "unknown_recipe_ids": unknown_ids,
        "items_outside_date_range": out_of_range,
        "items_with_neither_recipe_nor_text": empty_items,
        "valid": not violations
        and not unknown_ids
        and not out_of_range
        and not empty_items,
    }


async def plan_week(
    anthropic_client: anthropic.AsyncAnthropic,
    settings: Settings,
    snapshot: CatalogSnapshot,
    *,
    constraints: str,
    starts_on: date,
    ends_on: date,
    today: date,
    exclude_days: int = 14,
    slots: list[str] | None = None,
) -> PlanWeekResult:
    slots = slots or ["dinner"]
    system_blocks = build_system_blocks(snapshot)

    response = await anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.max_tokens,
        # Adaptive thinking: no budget_tokens, which this model rejects.
        thinking={"type": "adaptive"},
        # effort lives INSIDE output_config, alongside the response format.
        output_config={"effort": settings.effort, "format": DRAFT_SCHEMA},
        system=system_blocks,
        # No tools at all: this endpoint cannot write, by construction.
        messages=[
            {
                "role": "user",
                "content": _build_request_text(
                    constraints, starts_on, ends_on, today, exclude_days, slots
                ),
            }
        ],
    )

    text = next((b.text for b in response.content if b.type == "text"), "")
    draft = DraftPlan.model_validate(json.loads(text))

    usage = response.usage
    return PlanWeekResult(
        draft=draft,
        verification=verify_draft(
            draft,
            snapshot,
            today=today,
            exclude_days=exclude_days,
            starts_on=starts_on,
            ends_on=ends_on,
        ),
        usage={
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cache_creation_input_tokens": getattr(
                usage, "cache_creation_input_tokens", None
            ),
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", None),
        },
        prefix_hash=snapshot.prefix_hash,
        catalog_size=len(snapshot.recipes),
        history_size=len(snapshot.cooks),
    )
