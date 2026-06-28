"""
Layer 2 NLP 审核服务启动入口
Usage: python start_nlp_service.py
  或: uvicorn layer2_nlp.main:app --host 0.0.0.0 --port 8001
"""
import os
import sys

# 确保项目根目录可被导入
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 设置默认模型路径为本地微调后的模型
os.environ.setdefault(
    "LAYER2_LOCAL_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "layer2_nlp", "runs", "epoch_1"),
)
os.environ.setdefault("LAYER2_MODEL_VERSION", "erlangshen_ft_v1")

import uvicorn
from layer2_nlp.main import app

if __name__ == "__main__":
    port = int(os.getenv("LAYER2_NLP_PORT", "8001"))
    host = os.getenv("LAYER2_NLP_HOST", "0.0.0.0")
    print(f"Starting Layer2 NLP service on {host}:{port}")
    print(f"Model: {os.environ['LAYER2_LOCAL_MODEL_PATH']}")
    uvicorn.run(app, host=host, port=port)
