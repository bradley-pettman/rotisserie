"""Mapping SDK and API failures onto HTTP responses.

Exceptions are caught MOST-SPECIFIC-FIRST and by type. Nothing here matches on
an error message: messages are prose that changes between SDK releases, while
`NotFoundError` is a contract.
"""
from __future__ import annotations

from typing import Any

import anthropic

from .api_client import ApiError


def describe_anthropic_error(exc: Exception) -> tuple[int, dict[str, Any]]:
    """(http_status, error_body) for an exception raised by the Anthropic SDK."""
    # Most specific first. NotFoundError and RateLimitError are both
    # APIStatusError subclasses, so their order relative to it matters.
    if isinstance(exc, anthropic.NotFoundError):
        return 502, {
            "kind": "model_not_found",
            "message": (
                "The Anthropic API does not recognise the configured model. "
                "Check ANTHROPIC_MODEL."
            ),
            "detail": exc.message,
        }
    if isinstance(exc, anthropic.AuthenticationError):
        return 503, {
            "kind": "no_credentials",
            "message": (
                "The Anthropic API rejected this service's credentials. Set "
                "ANTHROPIC_API_KEY in the environment, or run `ant auth login`."
            ),
            "detail": exc.message,
        }
    if isinstance(exc, anthropic.RateLimitError):
        retry_after = None
        if exc.response is not None:
            retry_after = exc.response.headers.get("retry-after")
        return 429, {
            "kind": "rate_limited",
            "message": "Rate limited by the Anthropic API.",
            "retry_after": retry_after,
            "detail": exc.message,
        }
    if isinstance(exc, anthropic.APIStatusError):
        status = 502 if exc.status_code >= 500 else 400
        return status, {
            "kind": "model_error",
            "message": f"Anthropic API returned {exc.status_code}.",
            "detail": exc.message,
        }
    if isinstance(exc, anthropic.APIConnectionError):
        return 504, {
            "kind": "model_unreachable",
            "message": "Could not reach the Anthropic API.",
            "detail": str(exc),
        }
    raise exc


def describe_api_error(exc: ApiError) -> tuple[int, dict[str, Any]]:
    """(http_status, error_body) for a failure from the Rotisserie JSON API."""
    return 502, {
        "kind": "rotisserie_api_error",
        "message": f"The Rotisserie API returned {exc.status}: {exc.message}",
        "path": exc.path,
        "detail": exc.details,
    }
