"""My-klick WhatsApp Inbox: read-only proxy to Chat360 public API v1."""
import os
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=4096)


def build_router(get_current_user, wa_filter=None):
    r = APIRouter(prefix="/api/wa-inbox", tags=["WA Inbox"])

    async def call(method, path, **kw):
        key = os.environ.get("CHAT360_API_KEY", "")
        base = os.environ.get("CHAT360_API_BASE", "https://chat360.attendy.in").rstrip("/")
        if not key:
            raise HTTPException(503, "CHAT360_API_KEY not set")
        async with httpx.AsyncClient(timeout=20) as c:
            res = await c.request(method, f"{base}/api/v1{path}", headers={"X-API-Key": key}, **kw)
        if res.status_code >= 400:
            raise HTTPException(res.status_code, res.text[:300])
        return res.json()

    @r.get("/conversations")
    async def list_convs(status: Optional[str] = None, page: int = 1, limit: int = 25, user=Depends(get_current_user)):
        p = {"page": page, "limit": limit}
        if status:
            p["status"] = status
        res = await call("GET", "/conversations", params=p)
        if wa_filter and isinstance(res.get("data"), list):
            res["data"] = await wa_filter(res["data"], user)
        return res

    @r.get("/conversations/{cid}")
    async def get_conv(cid: str, user=Depends(get_current_user)):
        res = await call("GET", f"/conversations/{cid}")
        if wa_filter and res.get("data") and not await wa_filter([res["data"]], user):
            raise HTTPException(403, "This chat is assigned to another staff")
        return res

    @r.post("/conversations/{cid}/reply")
    async def reply(cid: str, body: ReplyIn, user=Depends(get_current_user)):
        if wa_filter:
            cur = await call("GET", f"/conversations/{cid}")
            if cur.get("data") and not await wa_filter([cur["data"]], user):
                raise HTTPException(403, "This chat is assigned to another staff")
        return await call("POST", f"/conversations/{cid}/reply", json={"text": body.text})

    return r
