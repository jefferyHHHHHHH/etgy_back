from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .schemas import NlpCheckRequest, NlpCheckResponse
from .model_runtime import Layer2Classifier

app = FastAPI(title="Layer2 NLP Risk Service", version="1.0.0")
classifier = Layer2Classifier()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/api/v1/moderation/nlp-check", response_model=NlpCheckResponse)
def nlp_check(payload: NlpCheckRequest):
    if not payload.text.strip():
        return JSONResponse(
            status_code=400,
            content={"detail": "text is empty"},
        )
    result = classifier.predict(payload.text.strip())
    return result
