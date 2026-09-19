"""System-prompt assembly, split at the prompt-cache breakpoint.

Layout of every request this service makes:

    tools                      (deterministic order -- rendered before system)
    system[0]  INSTRUCTIONS + CATALOG + HISTORY   <- cache_control: ephemeral
    system[1]  (nothing)
    messages   today's date, the user's constraints, the conversation

Everything that changes per request lives in `messages`, AFTER the breakpoint.
The cached block therefore contains no timestamp, no request id and no relative
date -- see catalog.py for why that matters and what would silently break it.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from .catalog import CatalogSnapshot

BASE_INSTRUCTIONS = """\
You are the meal-planning assistant for Rotisserie, a family recipe app.

You can see the household's ENTIRE recipe collection and their recent cooking
history below. There is no search index and nothing hidden: if a dish is not in
the catalog, they do not have a recipe for it.

HOW TO PLAN
- Read constraints literally and satisfy all of them at once. "Nothing we've
  had in two weeks" means: exclude every recipe whose id appears in the cooking
  history within 14 days of today. Check ids, not names.
- "Easy"/"quick" means short total time and few steps. Prefer recipes tagged
  `quick` or `easy`, or with a small prep+cook total.
- A named fixture ("Friday is pizza night") is a hard constraint. If no recipe
  matches it, use free text for that slot rather than substituting a recipe the
  household did not ask for.
- Vary the week: do not repeat a protein or a cuisine on consecutive days.
- Every slot you fill must be either a real recipe id copied EXACTLY from the
  catalog, or free text. Never invent an id, and never guess at one.

WRITING TO THE DATABASE
- You do not have direct database access. Writes happen through tools, and the
  tools call the application's own HTTP API, which validates everything.
- NEVER save without the user's explicit confirmation. Proposing a plan and
  saving a plan are two different acts. Show the plan, let them react, and call
  `save_meal_plan` only once they have actually said yes in that conversation.
- The same applies to `log_cook`: confirm before recording that something was
  cooked.
"""


def build_system_blocks(snapshot: CatalogSnapshot) -> list[dict[str, Any]]:
    """The cached prefix: one text block, marked ephemeral.

    One block, not several, because the whole thing is stable for the
    snapshot's lifetime and a single breakpoint is all this shape needs.
    """
    return [
        {
            "type": "text",
            "text": f"{BASE_INSTRUCTIONS}\n\n{snapshot.rendered}",
            "cache_control": {"type": "ephemeral"},
        }
    ]


def today_preamble(today: date | None = None) -> str:
    """Volatile context. Goes in a user turn, never in the cached prefix."""
    today = today or date.today()
    return (
        f"Today is {today.isoformat()} ({today.strftime('%A')}). "
        "Use this to interpret any relative dates."
    )
