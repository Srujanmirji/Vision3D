from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .schemas import Error, ErrorResponse


class UploadBodyLimit:
    """Bound the multipart envelope before the parser can spool oversized uploads."""

    def __init__(self, app: ASGIApp, limit: int) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        length = Headers(scope=scope).get("content-length", "")
        if length.isascii() and length.isdecimal() and (len(length) > 20 or int(length) > self.limit):
            error = Error(code="INVALID_IMAGE", message="The upload exceeds the size limit.")
            response = JSONResponse(
                ErrorResponse(error=error).model_dump(),
                status_code=413,
                headers={"Cache-Control": "no-store"},
            )
            await response(scope, receive, send)
            return
        received = 0

        async def bounded_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, bounded_receive, send)
