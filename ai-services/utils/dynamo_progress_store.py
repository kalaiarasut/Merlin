from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class DynamoProgressStore:
    """Best-effort DynamoDB persistence for chat progress state.

    Enabled only when `DYNAMODB_PROGRESS_TABLE` is set.
    """

    def __init__(self) -> None:
        self.table_name = os.getenv("DYNAMODB_PROGRESS_TABLE", "").strip()
        self.ttl_seconds = int(os.getenv("DYNAMODB_PROGRESS_TTL_SECONDS", "86400"))
        self._table = None

    @property
    def enabled(self) -> bool:
        return bool(self.table_name)

    def _get_table(self):
        if not self.enabled:
            return None
        if self._table is not None:
            return self._table

        try:
            import boto3  # type: ignore
        except Exception as exc:
            logger.warning("boto3 not available; Dynamo progress store disabled: %s", exc)
            return None

        region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
        resource = boto3.resource("dynamodb", region_name=region) if region else boto3.resource("dynamodb")
        self._table = resource.Table(self.table_name)
        return self._table

    def upsert(
        self,
        *,
        request_id: str,
        stage: str,
        current: int,
        total: int,
        message: str,
        cancelled: bool,
        result_pointer: Optional[Dict[str, Any]] = None,
    ) -> None:
        table = self._get_table()
        if table is None:
            return

        now_epoch = int(datetime.now(timezone.utc).timestamp())
        item: Dict[str, Any] = {
            "chatRequestId": request_id,
            "status": stage,
            "progress": {
                "current": int(current),
                "total": int(total),
                "message": message or "",
                "cancelled": bool(cancelled),
                "updatedAt": now_epoch,
            },
            "updatedAt": now_epoch,
            "expiresAt": now_epoch + self.ttl_seconds,
        }
        if result_pointer is not None:
            item["resultPointer"] = result_pointer

        try:
            table.put_item(Item=item)
        except Exception as exc:
            logger.warning("Dynamo progress upsert failed for %s: %s", request_id, exc)

    def get(self, request_id: str) -> Optional[Dict[str, Any]]:
        table = self._get_table()
        if table is None:
            return None

        try:
            result = table.get_item(Key={"chatRequestId": request_id})
            return result.get("Item")
        except Exception as exc:
            logger.warning("Dynamo progress get failed for %s: %s", request_id, exc)
            return None


_store: Optional[DynamoProgressStore] = None


def get_dynamo_progress_store() -> DynamoProgressStore:
    global _store
    if _store is None:
        _store = DynamoProgressStore()
    return _store
