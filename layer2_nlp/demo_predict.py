"""本地演示脚本：不启动 HTTP 服务，直接加载模型预测。"""
import json
import os
import sys

# 确保项目根目录在 path 中，支持 python -m layer2_nlp.demo_predict 和直接运行
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_THIS_DIR)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

os.environ.setdefault("LAYER2_LOCAL_MODEL_PATH", os.path.join(_PROJECT_ROOT, "layer2_nlp", "runs", "epoch_1"))
os.environ.setdefault("LAYER2_MODEL_VERSION", "qinghua_epoch1")

from layer2_nlp.model_runtime import Layer2Classifier

CASES_PATH = os.path.join(_THIS_DIR, "demo_test_cases.json")


def main():
    with open(CASES_PATH, "r", encoding="utf-8") as f:
        cases = json.load(f)

    clf = Layer2Classifier()
    print(f"Model loaded from: {os.environ['LAYER2_LOCAL_MODEL_PATH']}\n")
    print(f"{'ID':<10} {'期望':<8} {'实际':<8} {'风险分':<8} 文本")
    print("-" * 80)

    ok = 0
    for case in cases:
        result = clf.predict(case["text"])
        match = result["decision"] == case["expected"]
        ok += int(match)
        mark = "OK" if match else "!!"
        text_preview = case["text"][:28] + ("..." if len(case["text"]) > 28 else "")
        print(
            f"{case['id']:<10} {case['expected']:<8} {result['decision']:<8} "
            f"{result['risk_score']:<8.4f} {text_preview}  [{mark}]"
        )

    print("-" * 80)
    print(f"命中 {ok}/{len(cases)} 条演示样例")


if __name__ == "__main__":
    main()
