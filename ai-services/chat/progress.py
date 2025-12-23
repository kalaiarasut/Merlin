"""
Progress Tracking Module for AI Chat

Provides real-time progress updates via Server-Sent Events (SSE).
Tracks stages: scraping, processing, complete.
"""

import asyncio
import logging
from typing import Dict, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)


@dataclass
class ProgressState:
    """Tracks progress of a chat request."""
    request_id: str
    stage: str = "started"  # started, fetching_db, scraping_fishbase, processing_llm, complete, error, cancelled
    current: int = 0
    total: int = 0
    message: str = ""
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    cancelled: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        elapsed = (datetime.now() - self.started_at).total_seconds()
        
        # Calculate ETA based on average time per item
        eta_seconds = None
        if self.current > 0 and self.total > 0 and self.current < self.total:
            avg_per_item = elapsed / self.current
            remaining = self.total - self.current
            eta_seconds = round(avg_per_item * remaining, 1)
        
        return {
            "request_id": self.request_id,
            "stage": self.stage,
            "current": self.current,
            "total": self.total,
            "message": self.message,
            "elapsed_seconds": round(elapsed, 1),
            "eta_seconds": eta_seconds,  # ETA in seconds
            "cancelled": self.cancelled
        }


class ProgressTracker:
    """
    Manages progress tracking for multiple concurrent requests.
    
    Usage:
        tracker = get_progress_tracker()
        request_id = tracker.start_request()
        
        # Update progress during processing
        tracker.update(request_id, "scraping_fishbase", current=3, total=10)
        
        # Complete
        tracker.complete(request_id, "Success")
    """
    
    def __init__(self):
        self._progress: Dict[str, ProgressState] = {}
        self._subscribers: Dict[str, asyncio.Queue] = {}
        self._cancelled: set = set()  # Track cancelled requests
    
    def cancel(self, request_id: str) -> bool:
        """Cancel a running request."""
        self._cancelled.add(request_id)
        if request_id in self._progress:
            state = self._progress[request_id]
            state.stage = "cancelled"
            state.cancelled = True
            state.message = "Request cancelled by user"
            self._notify_subscribers(request_id, state)
            logger.info(f"Request cancelled: {request_id}")
            return True
        return False
    
    def is_cancelled(self, request_id: str) -> bool:
        """Check if a request has been cancelled."""
        return request_id in self._cancelled
    
    def start_request(self, request_id: Optional[str] = None) -> str:
        """Start tracking a new request."""
        if not request_id:
            request_id = str(uuid.uuid4())[:8]
        
        self._progress[request_id] = ProgressState(request_id=request_id)
        logger.debug(f"Progress tracking started: {request_id}")
        return request_id
    
    def update(self, request_id: str, stage: str, current: int = 0, total: int = 0, message: str = ""):
        """Update progress for a request."""
        if request_id not in self._progress:
            self._progress[request_id] = ProgressState(request_id=request_id)
        
        state = self._progress[request_id]
        state.stage = stage
        state.current = current
        state.total = total
        state.message = message
        
        logger.debug(f"Progress update: {request_id} - {stage} ({current}/{total}) {message}")
        
        # Notify subscribers
        self._notify_subscribers(request_id, state)
    
    def complete(self, request_id: str, message: str = "Complete"):
        """Mark request as complete."""
        if request_id in self._progress:
            state = self._progress[request_id]
            state.stage = "complete"
            state.message = message
            state.completed_at = datetime.now()
            self._notify_subscribers(request_id, state)
    
    def error(self, request_id: str, error_message: str):
        """Mark request as error."""
        if request_id in self._progress:
            state = self._progress[request_id]
            state.stage = "error"
            state.message = error_message
            self._notify_subscribers(request_id, state)
    
    def get_progress(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Get current progress for a request."""
        if request_id in self._progress:
            return self._progress[request_id].to_dict()
        return None
    
    def subscribe(self, request_id: str) -> asyncio.Queue:
        """Subscribe to progress updates via async queue."""
        if request_id not in self._subscribers:
            self._subscribers[request_id] = asyncio.Queue()
        return self._subscribers[request_id]
    
    def unsubscribe(self, request_id: str):
        """Unsubscribe from progress updates."""
        self._subscribers.pop(request_id, None)
        # Clean up old progress after unsubscribe
        self._progress.pop(request_id, None)
    
    def _notify_subscribers(self, request_id: str, state: ProgressState):
        """Send progress update to subscribers."""
        if request_id in self._subscribers:
            try:
                self._subscribers[request_id].put_nowait(state.to_dict())
            except asyncio.QueueFull:
                pass  # Drop update if queue is full


# Singleton instance
_progress_tracker: Optional[ProgressTracker] = None


def get_progress_tracker() -> ProgressTracker:
    """Get singleton progress tracker."""
    global _progress_tracker
    if _progress_tracker is None:
        _progress_tracker = ProgressTracker()
    return _progress_tracker
