"""Shared bounded HTTP readers. No multipart parser dependency is required."""
from __future__ import annotations

import json

from fastapi import HTTPException, Request


async def read_bounded_body(request: Request, maximum_bytes: int, *, allow_empty: bool = True) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            length = int(declared)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header") from error
        if length < 0:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header")
        if length > maximum_bytes:
            raise HTTPException(status_code=413, detail="Request body is too large")
    body = bytearray()
    async for chunk in request.stream():
        # Check before copying a chunk into the accumulated buffer.
        if len(chunk) > maximum_bytes - len(body):
            raise HTTPException(status_code=413, detail="Request body is too large")
        body.extend(chunk)
    if not body and not allow_empty:
        raise HTTPException(status_code=400, detail="Request body is empty")
    return bytes(body)


def _invalid_constant(value):
    raise ValueError(f"Invalid JSON constant: {value}")


async def read_bounded_json(request: Request, maximum_bytes: int) -> dict:
    raw = await read_bounded_body(request, maximum_bytes)
    if not raw:
        return {}
    try:
        value = json.loads(raw, parse_constant=_invalid_constant)
    except (ValueError, UnicodeDecodeError, RecursionError) as error:
        raise HTTPException(status_code=400, detail="Invalid JSON request") from error
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="JSON request must be an object")
    return value
