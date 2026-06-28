from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    model_name: str = os.getenv(
        "LAYER2_MODEL_NAME",
        "IDEA-CCNL/Erlangshen-Roberta-110M-Sentiment",
    )
    model_dir: str = os.getenv("LAYER2_MODEL_DIR", "./layer2_nlp/model_cache")
    local_model_path: str = os.getenv("LAYER2_LOCAL_MODEL_PATH", "")
    pass_threshold: float = float(os.getenv("LAYER2_PASS_THRESHOLD", "0.05"))
    review_threshold: float = float(os.getenv("LAYER2_REVIEW_THRESHOLD", "0.70"))
    model_version: str = os.getenv("LAYER2_MODEL_VERSION", "erlangshen_ft_v1")


settings = Settings()
