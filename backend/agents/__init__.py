"""Multi-agent assistant package for ShuroqX."""
from .supervisor import run_agents
from .sse import (
    ev_agent, ev_thought, ev_tool, ev_token, ev_match,
    ev_no_workers, ev_clarify, ev_error, ev_done, ev_start,
)

__all__ = [
    "run_agents",
    "ev_agent", "ev_thought", "ev_tool", "ev_token", "ev_match",
    "ev_no_workers", "ev_clarify", "ev_error", "ev_done", "ev_start",
]
