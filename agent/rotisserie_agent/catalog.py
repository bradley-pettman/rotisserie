"""The catalog snapshot: the whole recipe book, rendered for the system prompt.

WHY THERE IS NO SEARCH INDEX HERE. A family recipe collection is small -- tens
of recipes, not millions -- so the entire catalog fits in the prompt alongside
recent cooking history. Handing the model every row at once turns meal planning
into constraint satisfaction over data it can already see, which it does well,
and removes embeddings, a vector store, a ranking function and retrieval tuning
from the system. Semantic search is deliberately out of scope; if the
collection ever outgrows the context window, THAT is the moment to add
retrieval, and the snapshot boundary here is where it would go.

PROMPT CACHING. `rendered` is built once and reused verbatim for the snapshot's
whole lifetime, because prompt caching is a prefix match on bytes: a
re-rendered-but-equal string is fine, a string that embeds `datetime.now()` is
not. So nothing volatile goes in here -- no "cooked 3 days ago", no snapshot
timestamp, no request id. Cooking history is rendered with ABSOLUTE dates and
today's date is supplied later, after the cache breakpoint, in the user turn.
That split is what lets every request in the TTL window share one cached
prefix.

The snapshot is also the audit trail for the two-week rule:
`recently_cooked_recipe_ids` is computed from the same rows the model was
shown, so a draft can be checked against exactly what the model saw.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from .api_client import RotisserieClient


def _fmt_minutes(value: Any) -> str:
    return f"{value}m" if isinstance(value, int) and value > 0 else "-"


@dataclass(frozen=True)
class CatalogRecipe:
    id: str
    name: str
    tags: tuple[str, ...]
    prep_time_minutes: int | None
    cook_time_minutes: int | None
    servings: int | None

    @property
    def total_time_minutes(self) -> int | None:
        parts = [t for t in (self.prep_time_minutes, self.cook_time_minutes) if t]
        return sum(parts) if parts else None

    def to_compact_row(self) -> dict[str, Any]:
        """The compact shape `search_recipes` returns -- never the full recipe."""
        return {
            "id": self.id,
            "name": self.name,
            "tags": list(self.tags),
            "prepTimeMinutes": self.prep_time_minutes,
            "cookTimeMinutes": self.cook_time_minutes,
            "totalTimeMinutes": self.total_time_minutes,
            "servings": self.servings,
        }


@dataclass(frozen=True)
class CatalogSnapshot:
    recipes: tuple[CatalogRecipe, ...]
    cooks: tuple[dict[str, Any], ...]
    history_days: int
    fetched_at: float
    # Absolute day the history window opened, so the rendering stays stable.
    history_from: str
    rendered: str = field(repr=False)

    @property
    def prefix_hash(self) -> str:
        """Identifies the cached prefix. Equal hashes mean a cache hit is possible."""
        return hashlib.sha256(self.rendered.encode()).hexdigest()[:16]

    def age_seconds(self) -> float:
        return time.monotonic() - self.fetched_at

    def by_id(self) -> dict[str, CatalogRecipe]:
        return {r.id: r for r in self.recipes}

    def last_cooked(self) -> dict[str, str]:
        """recipe_id -> most recent 'YYYY-MM-DD' it was genuinely cooked.

        Leftovers are excluded, matching `lastCookedAt` in the TypeScript query
        module: eating Tuesday's chili again on Wednesday is not cooking it on
        Wednesday.
        """
        latest: dict[str, str] = {}
        for cook in self.cooks:
            recipe_id = cook.get("recipeId")
            if not recipe_id or cook.get("isLeftovers"):
                continue
            cooked_on = cook.get("cookedOn")
            if cooked_on and cooked_on > latest.get(recipe_id, ""):
                latest[recipe_id] = cooked_on
        return latest

    def recently_cooked_recipe_ids(self, days: int, *, today: date) -> set[str]:
        """Recipe ids cooked within `days` of `today` -- the exclusion set.

        Includes leftovers: having eaten a dish three days ago still counts
        against variety, which is what "nothing we've had in two weeks" means.
        """
        cutoff = (today - timedelta(days=days)).isoformat()
        return {
            cook["recipeId"]
            for cook in self.cooks
            if cook.get("recipeId") and str(cook.get("cookedOn", "")) >= cutoff
        }


def _render(
    recipes: tuple[CatalogRecipe, ...],
    cooks: tuple[dict[str, Any], ...],
    history_days: int,
    history_from: str,
) -> str:
    lines: list[str] = []

    lines.append("## RECIPE CATALOG")
    lines.append("")
    lines.append(
        f"The complete collection, {len(recipes)} recipes. "
        "These are all of them -- there is nothing else to search."
    )
    lines.append("")
    lines.append("id | name | tags | prep | cook | total | serves")
    lines.append("---|------|------|------|------|-------|-------")
    for r in recipes:
        lines.append(
            " | ".join(
                [
                    r.id,
                    r.name,
                    ",".join(r.tags) if r.tags else "-",
                    _fmt_minutes(r.prep_time_minutes),
                    _fmt_minutes(r.cook_time_minutes),
                    _fmt_minutes(r.total_time_minutes),
                    str(r.servings) if r.servings else "-",
                ]
            )
        )

    lines.append("")
    lines.append("## COOKING HISTORY")
    lines.append("")
    lines.append(
        f"Everything cooked since {history_from} "
        f"({history_days}-day window), newest first. Dates are absolute "
        "calendar days; the current date is given in the conversation."
    )
    lines.append("")
    if cooks:
        lines.append("cooked_on | meal | recipe_id | what | leftovers")
        lines.append("----------|------|-----------|------|----------")
        for cook in cooks:
            lines.append(
                " | ".join(
                    [
                        str(cook.get("cookedOn", "?")),
                        str(cook.get("mealSlot", "?")),
                        str(cook.get("recipeId") or "-"),
                        str(cook.get("label", "?")),
                        "yes" if cook.get("isLeftovers") else "no",
                    ]
                )
            )
    else:
        lines.append("(nothing cooked in this window)")

    return "\n".join(lines)


class CatalogCache:
    """Holds one snapshot and refetches it when the TTL lapses.

    Instantiated on the FastAPI app state rather than at module scope, so tests
    and concurrent apps do not share one. The lock makes a stampede of requests
    produce a single refetch, which matters because building a snapshot costs
    one list call plus a detail call per recipe.
    """

    def __init__(self, client: RotisserieClient, ttl_seconds: float, history_days: int,
                 concurrency: int = 8):
        self._client = client
        self._ttl = ttl_seconds
        self._history_days = history_days
        self._concurrency = concurrency
        self._snapshot: CatalogSnapshot | None = None
        self._lock = asyncio.Lock()

    async def get(self, *, force_refresh: bool = False) -> CatalogSnapshot:
        snapshot = self._snapshot
        if not force_refresh and snapshot and snapshot.age_seconds() < self._ttl:
            return snapshot

        async with self._lock:
            snapshot = self._snapshot
            if not force_refresh and snapshot and snapshot.age_seconds() < self._ttl:
                return snapshot
            self._snapshot = await self._build()
            return self._snapshot

    def peek(self) -> CatalogSnapshot | None:
        return self._snapshot

    async def _build(self) -> CatalogSnapshot:
        rows, cooks = await asyncio.gather(
            self._client.list_recipes(),
            self._client.get_cooking_history(self._history_days),
        )

        # GET /api/recipes returns rows WITHOUT tags -- `listRecipes` selects
        # only the `recipes` columns, and there is no ?include=tags and no
        # /api/tags endpoint. Tags are the main planning axis ("easy",
        # "vegetarian"), so they have to come from somewhere: the per-recipe
        # detail read is the only endpoint that carries them. That is an N+1
        # against the API, bounded here by a semaphore and paid once per TTL
        # window rather than per request. A `tags` array on the list rows would
        # remove it outright.
        semaphore = asyncio.Semaphore(self._concurrency)

        async def detail(recipe_id: str) -> dict[str, Any]:
            async with semaphore:
                return await self._client.get_recipe(recipe_id)

        details = await asyncio.gather(*(detail(row["id"]) for row in rows))

        recipes = tuple(
            sorted(
                (
                    CatalogRecipe(
                        id=d["id"],
                        name=d["name"],
                        tags=tuple(sorted(t["name"] for t in d.get("tags", []))),
                        prep_time_minutes=d.get("prepTimeMinutes"),
                        cook_time_minutes=d.get("cookTimeMinutes"),
                        servings=d.get("servings"),
                    )
                    for d in details
                ),
                # Sorted by name, not created_at: a deterministic order keeps
                # the rendered prefix stable when a recipe is edited.
                key=lambda r: (r.name.lower(), r.id),
            )
        )

        cooks_sorted = tuple(
            sorted(
                cooks,
                key=lambda c: (str(c.get("cookedOn", "")), str(c.get("id", ""))),
                reverse=True,
            )
        )

        history_from = (
            date.today() - timedelta(days=self._history_days)
        ).isoformat()

        return CatalogSnapshot(
            recipes=recipes,
            cooks=cooks_sorted,
            history_days=self._history_days,
            fetched_at=time.monotonic(),
            history_from=history_from,
            rendered=_render(recipes, cooks_sorted, self._history_days, history_from),
        )
