from pydantic import BaseModel, Field
from typing import List


class NlpCheckRequest(BaseModel):
    commentId: str = Field(..., min_length=1)
    userId: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=1000)
    scene: str = Field(default="child_comment")


class NlpCheckResponse(BaseModel):
    decision: str
    risk_score: float
    model_version: str
    reason_tags: List[str]
    latency_ms: int
