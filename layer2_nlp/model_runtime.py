import time
from typing import Dict, Any

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from .config import settings


class Layer2Classifier:
    def __init__(self):
        source = settings.local_model_path.strip() or settings.model_name
        self.tokenizer = AutoTokenizer.from_pretrained(
            source,
            cache_dir=settings.model_dir,
        )
        self.model = AutoModelForSequenceClassification.from_pretrained(
            source,
            cache_dir=settings.model_dir,
            use_safetensors=True,
            ignore_mismatched_sizes=True,
        )
        self.model.eval()

    @torch.no_grad()
    def predict(self, text: str) -> Dict[str, Any]:
        start = time.time()
        encoded = self.tokenizer(
            text,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        )
        logits = self.model(**encoded).logits
        probs = torch.softmax(logits, dim=-1).squeeze(0)

        # 约定 label=1 为风险；若模型标签定义不同，可在微调后统一改映射。
        risk_score = float(probs[1].item()) if probs.shape[0] > 1 else 0.0
        decision = "PASS" if risk_score < settings.pass_threshold else "REVIEW"

        latency_ms = int((time.time() - start) * 1000)
        return {
            "decision": decision,
            "risk_score": round(risk_score, 6),
            "model_version": settings.model_version,
            "reason_tags": ["nlp_risky"] if decision == "REVIEW" else ["none"],
            "latency_ms": latency_ms,
        }
