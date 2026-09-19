"""The single seam between this service and Rotisserie's data.

ARCHITECTURE RULE, and the reason this file is the only thing that speaks to
the outside world: **Python never writes to Postgres.** Every read and every
write goes through the TypeScript JSON API under /api/*, where the Zod schemas
and the transactions already live. Reimplementing `createRecipe` here would
mean two implementations of the same rules -- ingredient canonicalization, unit
folding, tag lowercasing, the intent/fact split -- and this codebase has
already paid for duplicated logic drifting apart. There is no psycopg
dependency in pyproject.toml, and that absence is the enforcement.

Envelope handling is centralized here because the API is uniform about it:

    success   {"data": <payload>}          200 / 201
    success   (no body)                    204
    failure   {"error": {status, message, details?}}

so callers get either a payload or an `ApiError` and never a raw Response.
"""
from __future__ import annotations

from types import TracebackType
from typing import Any

import httpx

from .config import Settings


class ApiError(RuntimeError):
    """A non-2xx answer from the TypeScript API, in its own error envelope."""

    def __init__(
        self, status: int, message: str, details: Any = None, *, path: str = ""
    ) -> None:
        self.status = status
        self.message = message
        self.details = details
        self.path = path
        suffix = f" ({path})" if path else ""
        super().__init__(f"[{status}] {message}{suffix}")

    def as_tool_result(self) -> str:
        """A readable, non-leaky rendering for a tool result."""
        parts = [f"Error {self.status}: {self.message}"]
        if self.details:
            parts.append(f"details: {self.details}")
        return " | ".join(parts)


class RotisserieClient:
    """Thin async HTTP client over the Rotisserie JSON API.

    Every method maps one-to-one onto a documented endpoint. It holds no
    caching, no business rules and no SQL -- if a rule is missing, it belongs in
    the TypeScript schemas, not here.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._settings = settings
        headers = {"Content-Type": "application/json"}
        # assertApiAccess() is two-mode: unset means open, set means this
        # header must match. Sending it when unset is harmless.
        if settings.internal_api_key:
            headers["X-Api-Key"] = settings.internal_api_key

        self._client = client or httpx.AsyncClient(
            base_url=settings.rotisserie_api_url.rstrip("/"),
            headers=headers,
            timeout=settings.api_timeout_seconds,
        )

    async def __aenter__(self) -> "RotisserieClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------
    # transport
    # ------------------------------------------------------------------
    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        response = await self._client.request(method, path, params=params, json=json)

        if response.status_code == 204:
            return None

        try:
            body = response.json()
        except ValueError:
            # The API promises JSON on every path; a non-JSON body means
            # something upstream of the route handler failed.
            raise ApiError(
                response.status_code,
                f"Non-JSON response from API: {response.text[:200]!r}",
                path=path,
            ) from None

        if response.is_success:
            # Unwrap the success envelope. `data` may legitimately be null.
            if isinstance(body, dict) and "data" in body:
                return body["data"]
            raise ApiError(
                response.status_code,
                "Success response was not in the {'data': ...} envelope",
                details=body,
                path=path,
            )

        error = body.get("error", {}) if isinstance(body, dict) else {}
        raise ApiError(
            error.get("status", response.status_code),
            error.get("message", "Unknown API error"),
            error.get("details"),
            path=path,
        )

    # ------------------------------------------------------------------
    # recipes
    # ------------------------------------------------------------------
    async def list_recipes(
        self, search: str | None = None, tags: list[str] | None = None
    ) -> list[dict[str, Any]]:
        """GET /api/recipes. NOTE: rows carry no tags or ingredients.

        `tags` filters ALL-OF but is not echoed back on the rows, which is why
        catalog.py has to fetch details per recipe to learn what a recipe is
        tagged with. See the note there.
        """
        params: dict[str, Any] = {}
        if search:
            params["search"] = search
        if tags:
            params["tags"] = ",".join(tags)
        return await self._request("GET", "/api/recipes", params=params)

    async def get_recipe(self, recipe_id: str) -> dict[str, Any]:
        """GET /api/recipes/:id -- the full recipe, with ingredients and tags."""
        return await self._request("GET", f"/api/recipes/{recipe_id}")

    async def create_recipe(self, recipe: dict[str, Any]) -> dict[str, Any]:
        """POST /api/recipes. Zod validates; this method does not."""
        return await self._request("POST", "/api/recipes", json=recipe)

    async def delete_recipe(self, recipe_id: str) -> None:
        await self._request("DELETE", f"/api/recipes/{recipe_id}")

    # ------------------------------------------------------------------
    # cooks -- append-only fact
    # ------------------------------------------------------------------
    async def get_cooking_history(self, days: int) -> list[dict[str, Any]]:
        """GET /api/cooks?days=N -- newest first, leftovers included."""
        return await self._request("GET", "/api/cooks", params={"days": days})

    async def log_cook(self, cook: dict[str, Any]) -> dict[str, Any]:
        """POST /api/cooks.

        Omitting `label` alongside a `recipeId` asks the API to snapshot the
        recipe's current name inside the insert's transaction, so a caller
        holding only an id need not read the recipe first.
        """
        return await self._request("POST", "/api/cooks", json=cook)

    async def delete_cook(self, cook_id: str) -> None:
        await self._request("DELETE", f"/api/cooks/{cook_id}")

    # ------------------------------------------------------------------
    # meal plans -- intent
    # ------------------------------------------------------------------
    async def create_meal_plan(self, plan: dict[str, Any]) -> dict[str, Any]:
        """POST /api/meal-plans -- plan fields plus an optional `items` array."""
        return await self._request("POST", "/api/meal-plans", json=plan)

    async def get_meal_plan(self, plan_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/meal-plans/{plan_id}")

    async def list_meal_plans(self) -> list[dict[str, Any]]:
        return await self._request("GET", "/api/meal-plans")

    async def delete_meal_plan(self, plan_id: str) -> None:
        await self._request("DELETE", f"/api/meal-plans/{plan_id}")

    async def add_plan_item(self, plan_id: str, item: dict[str, Any]) -> dict[str, Any]:
        return await self._request(
            "POST", f"/api/meal-plans/{plan_id}/items", json=item
        )

    async def get_adherence(self, plan_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/meal-plans/{plan_id}/adherence")

    async def fulfil_plan_item(self, item_id: str, cook_id: str) -> None:
        """PUT the (item, cook) link. Idempotent, per the route's contract."""
        await self._request(
            "PUT", f"/api/meal-plan-items/{item_id}/fulfillments/{cook_id}"
        )

    async def health(self) -> bool:
        """There is no /api/health, so the cheapest real read stands in."""
        await self.list_meal_plans()
        return True
