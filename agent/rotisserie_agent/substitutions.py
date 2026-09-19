"""`suggest_substitution`: one ingredient, one recipe, what to use instead.

IT READS AND NOTHING ELSE, and that is enforced by capability rather than by
instruction, exactly as `plan_week` is: the request carries no tools at all,
so there is no `save_meal_plan` and no `log_cook` for the model to reach for.
Being out of buttermilk is not a reason to touch the database.

WHY THE RECIPE ITSELF GOES IN THE PROMPT. Buttermilk in a cake is an acid
reacting with baking soda, and swapping in almond milk alone costs the rise;
buttermilk in a dressing is tang and body, where the same swap is wrong for an
entirely different reason. A substitution is a property of the dish, not of the
ingredient, so the model is shown THIS recipe's real ingredient list and its
real instructions -- fetched through `RotisserieClient.get_recipe`, the same
path the `get_recipe` tool uses, so what it reasons over is what the app
actually stores rather than a summary someone wrote of it.

The answer comes back through `output_config.format`, so a client parses it
instead of scraping prose. `verify_suggestion` then audits it against the very
row it came from: does it name the ingredient the recipe names, does it replace
the quantity the recipe calls for, and is any "substitute" just the original
ingredient again. As with the planner's constraint check, that exists so the
useful claim is checkable without reading the model's own account of its work.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import anthropic
from pydantic import BaseModel, Field

from .api_client import RotisserieClient
from .config import Settings
from .prompts import build_substitution_system_blocks

CONFIDENCE_LEVELS = ["high", "medium", "low"]

# Best-first, and short on purpose: a list of eleven near-identical swaps is
# not more helpful than three real ones, and every extra candidate is output
# tokens spent on padding.
DEFAULT_MAX_CANDIDATES = 4


def _as_float(value: Any) -> float | None:
    """Quantities arrive as whatever the driver made of a NUMERIC column.

    node-postgres renders NUMERIC as a string rather than a float, so the same
    quantity can reach here as 1.5, as "1.50", or as null. Comparing the
    model's echo against the recipe means having one type for all three.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt_quantity(value: float | None) -> str:
    """1.5 -> '1.5', 2.0 -> '2'. Trailing '.0' in a recipe reads like noise."""
    return "" if value is None else f"{value:g}"


# ---------------------------------------------------------------------------
# resolving "buttermilk" onto a row of this recipe
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class IngredientMatch:
    """The recipe row the request resolved to, and how it resolved."""

    name: str
    quantity: float | None
    unit: str | None
    notes: str | None
    # "exact" on a name match, "partial" when the request was a substring of
    # the stored name or vice versa ("milk" -> "whole milk").
    kind: str

    def amount(self) -> str:
        return " ".join(p for p in (_fmt_quantity(self.quantity), self.unit or "") if p)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "quantity": self.quantity,
            "unit": self.unit,
            "notes": self.notes,
            "match": self.kind,
        }


class IngredientLookupError(LookupError):
    """The named ingredient is not one row of this recipe.

    Carries the recipe's real ingredient names, because every caller wants
    them: the endpoint returns them so a client can correct the request, and
    the chat tool hands them to the model so it asks a sensible follow-up
    instead of guessing at what the user meant.
    """

    def __init__(
        self,
        kind: str,
        requested: str,
        recipe: dict[str, Any],
        candidates: list[str] | None = None,
    ) -> None:
        # "not_in_recipe" or "ambiguous" -- two situations, one handler.
        self.kind = kind
        self.requested = requested
        self.recipe_id = recipe.get("id")
        self.recipe_name = recipe.get("name", "")
        self.available = [str(row.get("name", "")) for row in recipe.get("ingredients", [])]
        self.candidates = candidates or []

        if kind == "ambiguous":
            message = (
                f"{requested!r} matches more than one ingredient in "
                f"{self.recipe_name!r}: {', '.join(self.candidates)}. "
                "Say which one."
            )
        else:
            message = (
                f"{self.recipe_name!r} has no ingredient matching {requested!r}. "
                f"It calls for: {', '.join(self.available) or '(nothing)'}."
            )
        self.message = message
        super().__init__(message)

    def as_tool_result(self) -> str:
        return self.message

    def as_error_body(self) -> dict[str, Any]:
        return {
            "kind": f"ingredient_{self.kind}",
            "message": self.message,
            "requested": self.requested,
            "recipe_id": self.recipe_id,
            "recipe_name": self.recipe_name,
            "recipe_ingredients": self.available,
            "ambiguous_matches": self.candidates,
        }


def find_ingredient(recipe: dict[str, Any], requested: str) -> IngredientMatch:
    """Resolve a name the user typed onto one row of this recipe.

    Exact beats partial, and an ambiguous partial is REFUSED rather than
    guessed at: picking between "milk" and "buttermilk" on the user's behalf is
    precisely the silent wrong answer this feature must not give. Ingredient
    names are canonicalized lowercase by the TypeScript API, so matching is
    case-folded on both sides.
    """
    wanted = requested.strip().casefold()
    rows = recipe.get("ingredients") or []

    if not wanted:
        raise IngredientLookupError("not_in_recipe", requested, recipe)

    for row in rows:
        if str(row.get("name", "")).strip().casefold() == wanted:
            return _match(row, "exact")

    partial = [
        row
        for row in rows
        if wanted in str(row.get("name", "")).casefold()
        or str(row.get("name", "")).casefold() in wanted
    ]
    if len(partial) == 1:
        return _match(partial[0], "partial")
    if len(partial) > 1:
        raise IngredientLookupError(
            "ambiguous",
            requested,
            recipe,
            candidates=[str(row.get("name", "")) for row in partial],
        )

    raise IngredientLookupError("not_in_recipe", requested, recipe)


def _match(row: dict[str, Any], kind: str) -> IngredientMatch:
    return IngredientMatch(
        name=str(row.get("name", "")),
        quantity=_as_float(row.get("quantity")),
        unit=row.get("unit"),
        notes=row.get("notes"),
        kind=kind,
    )


# ---------------------------------------------------------------------------
# the context the model is shown
# ---------------------------------------------------------------------------
def render_recipe_context(recipe: dict[str, Any], match: IngredientMatch) -> str:
    """The recipe as the model sees it: real ingredients, real instructions.

    The instructions are included verbatim and in full. They are where the
    heat, the timing and the order live, and those decide whether a swap
    survives -- something that splits at a simmer is not a substitute in a
    sauce that simmers for an hour, and nothing in the ingredient list says so.

    The line under discussion is marked, so which row is in question is never
    something the model has to infer from a name it was given separately.
    """
    lines: list[str] = []

    tags = ", ".join(sorted(t["name"] for t in recipe.get("tags", []))) or "-"
    meta = " | ".join(
        [
            f"serves {recipe['servings']}" if recipe.get("servings") else "serves -",
            f"prep {recipe['prepTimeMinutes']}m" if recipe.get("prepTimeMinutes") else "prep -",
            f"cook {recipe['cookTimeMinutes']}m" if recipe.get("cookTimeMinutes") else "cook -",
        ]
    )

    lines.append("## THE RECIPE THEY ARE COOKING")
    lines.append("")
    lines.append(f"{recipe.get('name', '(unnamed)')}  (id {recipe.get('id')})")
    lines.append(f"tags: {tags}")
    lines.append(meta)
    lines.append("")
    lines.append("### INGREDIENTS, exactly as the recipe stores them")
    lines.append("")
    for row in recipe.get("ingredients") or []:
        amount = " ".join(
            p for p in (_fmt_quantity(_as_float(row.get("quantity"))), row.get("unit") or "") if p
        )
        text = f"- {amount + ' ' if amount else ''}{row.get('name', '?')}"
        if row.get("notes"):
            text += f" ({row['notes']})"
        if str(row.get("name", "")) == match.name:
            text += "   <-- THE INGREDIENT TO REPLACE"
        lines.append(text)

    lines.append("")
    lines.append("### INSTRUCTIONS, verbatim")
    lines.append("")
    lines.append(str(recipe.get("instructions") or "(none recorded)"))

    if recipe.get("notes"):
        lines.append("")
        lines.append("### RECIPE NOTES, verbatim")
        lines.append("")
        lines.append(str(recipe["notes"]))

    return "\n".join(lines)


@dataclass(frozen=True)
class RecipeContext:
    """One recipe, one resolved ingredient, and the text built from them."""

    recipe: dict[str, Any]
    requested: str
    match: IngredientMatch
    rendered: str

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.recipe.get("id"),
            "name": self.recipe.get("name"),
            "tags": sorted(t["name"] for t in self.recipe.get("tags", [])),
            "servings": self.recipe.get("servings"),
            "prepTimeMinutes": self.recipe.get("prepTimeMinutes"),
            "cookTimeMinutes": self.recipe.get("cookTimeMinutes"),
        }

    def full(self) -> dict[str, Any]:
        """Everything the model was given, for the endpoint's response body.

        The client gets the same ingredients and instructions the answer was
        derived from, so "it knew this was a cake" is checkable rather than
        assumed -- the same reason `/catalog` hands back its exact prefix.
        """
        return {
            **self.summary(),
            "ingredients": [
                {
                    "name": row.get("name"),
                    "quantity": _as_float(row.get("quantity")),
                    "unit": row.get("unit"),
                    "notes": row.get("notes"),
                }
                for row in self.recipe.get("ingredients") or []
            ],
            "instructions": self.recipe.get("instructions"),
            "notes": self.recipe.get("notes"),
        }


async def load_recipe_context(
    client: RotisserieClient, recipe_id: str, ingredient: str
) -> RecipeContext:
    """Fetch the recipe and resolve the ingredient against it.

    Deliberately model-free: everything up to the request is exercisable, and
    checkable, without a single token being spent.
    """
    recipe = await client.get_recipe(recipe_id)
    match = find_ingredient(recipe, ingredient)
    return RecipeContext(
        recipe=recipe,
        requested=ingredient.strip(),
        match=match,
        rendered=render_recipe_context(recipe, match),
    )


# ---------------------------------------------------------------------------
# the structured answer
# ---------------------------------------------------------------------------
class SubstitutionCandidate(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    preparation: str | None = None
    effect: str = ""
    confidence: str = "medium"
    caveat: str | None = None
    meets_constraint: bool | None = None


class SubstitutionAnswer(BaseModel):
    ingredient: str
    original_quantity: float | None = None
    original_unit: str | None = None
    role: str = ""
    candidates: list[SubstitutionCandidate] = Field(default_factory=list)
    no_good_substitute: bool = False
    general_notes: str | None = None


# Every property is listed in `required` and additionalProperties is false, as
# structured outputs expect; optionality is expressed with nullable types. The
# descriptions are the instructions the model reads per field, so they are the
# interface -- edit them as such.
SUBSTITUTION_SCHEMA: dict[str, Any] = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "ingredient",
            "original_quantity",
            "original_unit",
            "role",
            "candidates",
            "no_good_substitute",
            "general_notes",
        ],
        "properties": {
            "ingredient": {
                "type": "string",
                "description": "The ingredient being replaced, copied EXACTLY as it appears in the recipe's ingredient list.",
            },
            "original_quantity": {
                "type": ["number", "null"],
                "description": "How much of it this recipe calls for, copied from the ingredient list. Null when the recipe gives no quantity.",
            },
            "original_unit": {
                "type": ["string", "null"],
                "description": "The unit that quantity is in, copied from the ingredient list. Null when there is none.",
            },
            "role": {
                "type": "string",
                "description": "One or two sentences on what this ingredient is doing IN THIS RECIPE -- leavening, tenderizing, thickening, acidity, fat, bulk, flavour, colour -- and therefore what a replacement has to reproduce.",
            },
            "candidates": {
                "type": "array",
                "minItems": 1,
                "description": "The replacements, best first.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "name",
                        "quantity",
                        "unit",
                        "preparation",
                        "effect",
                        "confidence",
                        "caveat",
                        "meets_constraint",
                    ],
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "What to use instead, e.g. 'whole milk + lemon juice'.",
                        },
                        "quantity": {
                            "type": ["number", "null"],
                            "description": "How much of it to use IN PLACE OF the amount this recipe calls for -- an amount, not a ratio. Null only when a quantity genuinely does not apply.",
                        },
                        "unit": {
                            "type": ["string", "null"],
                            "description": "The unit for that quantity, e.g. 'cup', 'tablespoon', 'gram'. Null when quantity is null or the amount is a plain count.",
                        },
                        "preparation": {
                            "type": ["string", "null"],
                            "description": "Any step the swap itself requires, e.g. 'stir and let stand 10 minutes before using'. Null when there is none.",
                        },
                        "effect": {
                            "type": "string",
                            "description": "ONE line on what this changes about the finished dish. What is actually different -- including when the honest answer is 'almost nothing'.",
                        },
                        "confidence": {
                            "type": "string",
                            "enum": CONFIDENCE_LEVELS,
                            "description": "How well this works in THIS recipe, given what the ingredient is doing here.",
                        },
                        "caveat": {
                            "type": ["string", "null"],
                            "description": "A warning that matters -- 'the crumb will be denser', 'do not let it boil'. Null when there is genuinely nothing to warn about; do not manufacture one.",
                        },
                        "meets_constraint": {
                            "type": ["boolean", "null"],
                            "description": "Whether this candidate actually satisfies the reason they gave (genuinely dairy-free, genuinely milder). Null when they gave no reason.",
                        },
                    },
                },
            },
            "no_good_substitute": {
                "type": "boolean",
                "description": "True when nothing really works here and the honest answer is to shop or cook something else. Say so rather than padding the list.",
            },
            "general_notes": {
                "type": ["string", "null"],
                "description": "Anything that applies to the answer as a whole rather than to one candidate. Null when there is nothing to add.",
            },
        },
    },
}


def _build_request_text(context: RecipeContext, reason: str | None, max_candidates: int) -> str:
    match = context.match
    amount = match.amount() or "an unstated amount"
    reason_line = (
        f'Their reason, in their words: "{reason.strip()}"'
        if reason and reason.strip()
        else "They did not say why."
    )
    named_differently = (
        f"They asked about {context.requested!r}; in this recipe that is {match.name!r}.\n"
        if match.kind != "exact"
        else ""
    )

    return (
        f"{context.rendered}\n\n"
        f"## THE QUESTION\n\n"
        f"{named_differently}"
        f"They need to replace the {match.name} -- the recipe calls for {amount} "
        f"of it.\n"
        f"{reason_line}\n\n"
        f"Work out what the {match.name} is doing in THIS recipe, then give at "
        f"most {max_candidates} replacements, best first, each with the amount "
        f"to use in place of {amount}.\n"
        f"If their reason rules things out, every candidate you return must "
        f"comply with it and say so in meets_constraint -- a dairy allergy "
        f"rules out butter, ghee and yoghurt as firmly as it rules out milk.\n"
        f"If nothing really works, set no_good_substitute rather than padding "
        f"the list.\n\n"
        f"This is ADVICE. Nothing is being changed and nothing is being saved."
    )


def verify_suggestion(
    answer: SubstitutionAnswer, context: RecipeContext, *, reason: str | None
) -> dict[str, Any]:
    """Audit the answer against the recipe row it was supposed to be about.

    Independent of anything the model said about its own work. The failures
    this catches are the ones that look fine in prose: an answer that quietly
    drifts to a different ingredient, one that replaces a quantity the recipe
    never called for, one that offers the original ingredient back as its own
    substitute, and -- when a reason was given -- one that offers a candidate
    it has itself marked as breaking that reason.
    """
    match = context.match
    target = match.name.strip().casefold()
    claimed = answer.ingredient.strip().casefold()

    repeats_original = [
        c.name for c in answer.candidates if c.name.strip().casefold() == target
    ]
    missing_quantity = (
        [c.name for c in answer.candidates if c.quantity is None]
        if match.quantity is not None
        else []
    )
    has_reason = bool(reason and reason.strip())
    breaks_reason = (
        [c.name for c in answer.candidates if c.meets_constraint is False]
        if has_reason
        else []
    )
    bad_confidence = [
        c.name for c in answer.candidates if c.confidence not in CONFIDENCE_LEVELS
    ]

    quantity_matches = (
        answer.original_quantity is None
        if match.quantity is None
        else answer.original_quantity is not None
        and abs(answer.original_quantity - match.quantity) < 1e-9
    )

    return {
        "requested": context.requested,
        "resolved_to": match.name,
        "match": match.kind,
        "recipe_quantity": match.quantity,
        "recipe_unit": match.unit,
        "answers_about_the_right_ingredient": claimed == target,
        "replaces_the_right_quantity": quantity_matches,
        "candidate_count": len(answer.candidates),
        "candidates_repeating_the_original": repeats_original,
        "candidates_without_a_quantity": missing_quantity,
        "candidates_that_break_the_stated_reason": breaks_reason,
        "candidates_with_an_unknown_confidence": bad_confidence,
        "reason_given": has_reason,
        "valid": (
            claimed == target
            and quantity_matches
            and not repeats_original
            and not missing_quantity
            and not breaks_reason
            and not bad_confidence
            and (bool(answer.candidates) or answer.no_good_substitute)
        ),
    }


@dataclass
class SubstitutionResult:
    answer: SubstitutionAnswer
    verification: dict[str, Any]
    usage: dict[str, Any]


async def suggest_substitution(
    anthropic_client: anthropic.AsyncAnthropic,
    settings: Settings,
    context: RecipeContext,
    *,
    reason: str | None = None,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> SubstitutionResult:
    response = await anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.max_tokens,
        # Adaptive thinking: no budget_tokens, which this model rejects.
        thinking={"type": "adaptive"},
        # effort lives INSIDE output_config, alongside the response format.
        output_config={"effort": settings.effort, "format": SUBSTITUTION_SCHEMA},
        system=build_substitution_system_blocks(),
        # No tools at all: this path cannot write, by construction.
        messages=[
            {
                "role": "user",
                "content": _build_request_text(context, reason, max_candidates),
            }
        ],
    )

    text = next((b.text for b in response.content if b.type == "text"), "")
    answer = SubstitutionAnswer.model_validate(json.loads(text))

    usage = response.usage
    return SubstitutionResult(
        answer=answer,
        verification=verify_suggestion(answer, context, reason=reason),
        usage={
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cache_creation_input_tokens": getattr(
                usage, "cache_creation_input_tokens", None
            ),
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", None),
        },
    )
