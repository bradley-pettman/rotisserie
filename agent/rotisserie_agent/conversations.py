"""Conversation state, keyed by conversation id.

CHOICE: an in-process, TTL'd, LRU-bounded dict, held on the FastAPI app state
rather than at module scope. That keeps it out of module globals, gives each
conversation its own lock, and -- the point of the exercise -- confines every
assumption about WHERE state lives to this one class.

What that buys: `ConversationStore` is an interface with four methods
(`get_or_create`, `save`, `drop`, `stats`), all async, none of which promises
that storage is local. Swapping in Redis or a `conversations` table means
reimplementing those four methods and changing the line in main.py that
constructs it. Nothing else in the service touches `messages` directly.

What it costs, stated plainly because it is a real limitation: state dies with
the process and does not survive a restart, and a second replica would not see
the first's conversations. That is fine for a single-process service and is not
fine behind a load balancer. The TTL is a liveness guard, not a product
feature -- a conversation older than the TTL is dropped, not archived.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Conversation:
    id: str
    messages: list[dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    # Serializes concurrent turns on one conversation: two requests for the
    # same id would otherwise interleave and corrupt the message history.
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def touch(self) -> None:
        self.updated_at = time.time()

    def age_seconds(self) -> float:
        return time.time() - self.updated_at


class ConversationStore:
    """In-memory conversation store. See the module docstring for the tradeoff."""

    def __init__(self, ttl_seconds: float = 3600.0, max_conversations: int = 500):
        self._ttl = ttl_seconds
        self._max = max_conversations
        self._items: "OrderedDict[str, Conversation]" = OrderedDict()
        self._lock = asyncio.Lock()

    async def get_or_create(self, conversation_id: str | None) -> Conversation:
        async with self._lock:
            self._evict_expired()

            if conversation_id:
                existing = self._items.get(conversation_id)
                if existing is not None:
                    self._items.move_to_end(conversation_id)
                    return existing

            # An unknown id is honoured rather than replaced, so a client that
            # generates its own ids keeps working across a service restart.
            new_id = conversation_id or f"conv_{uuid.uuid4().hex[:16]}"
            conversation = Conversation(id=new_id)
            self._items[new_id] = conversation
            self._evict_overflow()
            return conversation

    async def save(self, conversation: Conversation) -> None:
        async with self._lock:
            conversation.touch()
            self._items[conversation.id] = conversation
            self._items.move_to_end(conversation.id)
            self._evict_overflow()

    async def drop(self, conversation_id: str) -> bool:
        async with self._lock:
            return self._items.pop(conversation_id, None) is not None

    async def stats(self) -> dict[str, Any]:
        async with self._lock:
            self._evict_expired()
            return {
                "conversations": len(self._items),
                "ttl_seconds": self._ttl,
                "max_conversations": self._max,
                "backend": "in-memory",
            }

    # Both eviction helpers assume the caller holds `self._lock`.
    def _evict_expired(self) -> None:
        stale = [k for k, v in self._items.items() if v.age_seconds() > self._ttl]
        for key in stale:
            del self._items[key]

    def _evict_overflow(self) -> None:
        while len(self._items) > self._max:
            self._items.popitem(last=False)
