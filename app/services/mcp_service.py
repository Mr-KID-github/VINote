"""
Shared MCP request handling for stdio and HTTP transports.
"""
import json
import logging
import uuid
from typing import Any

from app.services.note_service import NoteService

logger = logging.getLogger(__name__)


class VINoteMCPServer:
    def __init__(self, note_service: NoteService | None = None):
        self.note_service = note_service or NoteService()

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": "generate_video_note",
                "description": "Generate a Markdown note from a video URL.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "video_url": {
                            "type": "string",
                            "description": "Video URL, for example https://www.bilibili.com/video/BV1xxx",
                        },
                        "style": {
                            "type": "string",
                            "description": "Note style.",
                            "default": "detailed",
                        },
                        "summary_mode": {
                            "type": "string",
                            "description": "Summarization strategy.",
                            "enum": ["default", "accurate", "oneshot"],
                            "default": "default",
                        },
                        "extras": {
                            "type": "string",
                            "description": "Extra note-generation instructions.",
                        },
                        "output_language": {
                            "type": "string",
                            "description": "Output note language.",
                            "enum": ["zh-CN", "en"],
                        },
                    },
                    "required": ["video_url"],
                },
            },
            {
                "name": "list_note_styles",
                "description": "List supported note styles.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                },
            },
        ]

    def list_styles(self) -> dict[str, Any]:
        return self.note_service.list_styles()

    def generate_note(
        self,
        *,
        video_url: str | None,
        style: str = "detailed",
        summary_mode: str = "default",
        extras: str | None = None,
        output_language: str | None = None,
    ) -> dict[str, Any]:
        if not video_url:
            return {"success": False, "error": "Missing required argument: video_url"}

        try:
            task_id = str(uuid.uuid4())
            result = self.note_service.generate(
                video_url=video_url,
                task_id=task_id,
                style=style,
                summary_mode=summary_mode,
                extras=extras,
                output_language=output_language,
            )
            return {
                "success": True,
                "task_id": task_id,
                "title": result.audio_meta.title,
                "duration": result.audio_meta.duration,
                "platform": result.audio_meta.platform,
                "video_id": result.audio_meta.video_id,
                "summary_mode": result.summary_mode,
                "markdown": result.markdown,
                "output_path": result.output_dir,
            }
        except Exception as exc:
            logger.exception("[MCP] generate_note failed")
            return {"success": False, "error": str(exc)}

    def handle_request(self, request: dict[str, Any]) -> dict[str, Any] | None:
        method = request.get("method")
        request_id = request.get("id")

        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "vinote", "version": "1.0.0"},
                },
            }

        if method == "notifications/initialized":
            return None

        if method == "ping":
            return {"jsonrpc": "2.0", "id": request_id, "result": {}}

        if method == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"tools": self.list_tools()},
            }

        if method == "tools/call":
            tool_name = request.get("params", {}).get("name")
            arguments = request.get("params", {}).get("arguments", {})
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError:
                    return self._error_response(
                        request_id,
                        -32602,
                        "Tool arguments must be a JSON object or a JSON-encoded object string.",
                    )
            if not isinstance(arguments, dict):
                return self._error_response(request_id, -32602, "Tool arguments must be an object.")

            if tool_name == "generate_video_note":
                result = self.generate_note(
                    video_url=arguments.get("video_url"),
                    style=arguments.get("style", "detailed"),
                    summary_mode=arguments.get("summary_mode", "default"),
                    extras=arguments.get("extras"),
                    output_language=arguments.get("output_language"),
                )
            elif tool_name == "list_note_styles":
                result = self.list_styles()
            else:
                return self._error_response(request_id, -32601, f"Unknown tool: {tool_name}")

            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                    "isError": not result.get("success", True),
                },
            }

        return self._error_response(request_id, -32601, f"Method not found: {method}")

    def handle_payload(self, payload: dict[str, Any] | list[Any]) -> dict[str, Any] | list[Any] | None:
        if isinstance(payload, list):
            responses = []
            for item in payload:
                if not isinstance(item, dict):
                    responses.append(self._error_response(None, -32600, "Invalid request"))
                    continue
                response = self.handle_request(item)
                if response is not None:
                    responses.append(response)
            return responses

        return self.handle_request(payload)

    @staticmethod
    def _error_response(request_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }


mcp_server = VINoteMCPServer()
