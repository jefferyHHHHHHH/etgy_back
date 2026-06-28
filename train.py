import argparse
import json
import os
from datetime import datetime, timezone

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import pandas as pd
from sklearn.model_selection import train_test_split
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)
import numpy as np
from sklearn.metrics import accuracy_score, precision_recall_fscore_support


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    p, r, f1, _ = precision_recall_fscore_support(labels, preds, average="binary")
    acc = accuracy_score(labels, preds)
    return {"accuracy": acc, "precision": p, "recall": r, "f1": f1}


def append_run_history(run_dir: str, record: dict):
    history_path = os.path.join(run_dir, "history.json")
    history = []
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            history = json.load(f)
    history.append(record)
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="xlsx/csv with columns: text,label")
    parser.add_argument("--model", default="IDEA-CCNL/Erlangshen-Roberta-110M-Sentiment")
    parser.add_argument("--run-dir", default="./layer2_nlp/runs")
    parser.add_argument("--epoch-num", type=int, default=1, help="current epoch number, saved to epoch_N/")
    parser.add_argument("--epochs", type=int, default=1, help="epochs to train in this run (default 1)")
    parser.add_argument("--resume-from", default="", help="path to previous epoch model directory")
    parser.add_argument("--max-samples", type=int, default=0, help="0=use all; otherwise stratified subsample")
    parser.add_argument("--max-steps", type=int, default=0, help="0=unlimited; otherwise stop after N steps")
    args = parser.parse_args()

    output_dir = os.path.join(args.run_dir, f"epoch_{args.epoch_num}")
    os.makedirs(output_dir, exist_ok=True)

    if args.input.endswith(".xlsx"):
        df = pd.read_excel(args.input)
    else:
        df = pd.read_csv(args.input)

    df = df[["text", "label"]].dropna()
    if args.max_samples > 0 and args.max_samples < len(df):
        per_label = args.max_samples // 2
        df = (
            df.groupby("label", group_keys=False)
            .apply(lambda x: x.sample(min(len(x), per_label), random_state=42), include_groups=False)
            .reset_index(drop=True)
        )
        print(f"Using stratified subsample: {len(df)} rows")
    else:
        print(f"Using full dataset: {len(df)} rows")

    train_df, val_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df["label"])
    train_ds = Dataset.from_pandas(train_df.reset_index(drop=True))
    val_ds = Dataset.from_pandas(val_df.reset_index(drop=True))

    model_source = args.resume_from.strip() or args.model
    print(f"Loading model from: {model_source}")

    tokenizer = AutoTokenizer.from_pretrained(model_source)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_source,
        num_labels=2,
        use_safetensors=True,
        ignore_mismatched_sizes=True,
    )

    def tokenize_fn(batch):
        return tokenizer(batch["text"], truncation=True, padding="max_length", max_length=256)

    train_ds = train_ds.map(tokenize_fn, batched=True)
    val_ds = val_ds.map(tokenize_fn, batched=True)
    train_ds = train_ds.rename_column("label", "labels")
    val_ds = val_ds.rename_column("label", "labels")
    train_ds.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
    val_ds.set_format("torch", columns=["input_ids", "attention_mask", "labels"])

    use_full_epoch = args.max_steps <= 0
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps if args.max_steps > 0 else -1,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        eval_strategy="epoch" if use_full_epoch else "no",
        save_strategy="epoch" if use_full_epoch else "steps",
        save_steps=50 if not use_full_epoch else 500,
        logging_steps=20,
        learning_rate=2e-5,
        load_best_model_at_end=False,
        dataloader_num_workers=0,
        use_cpu=True,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
    )

    train_result = trainer.train()
    eval_metrics = trainer.evaluate()

    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)

    record = {
        "epoch_num": args.epoch_num,
        "output_dir": output_dir,
        "resume_from": args.resume_from or args.model,
        "train_samples": len(train_df),
        "val_samples": len(val_df),
        "train_runtime_sec": train_result.metrics.get("train_runtime"),
        "train_loss": train_result.metrics.get("train_loss"),
        "eval_metrics": eval_metrics,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }

    metrics_path = os.path.join(output_dir, "metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)

    append_run_history(args.run_dir, record)
    print(f"Epoch {args.epoch_num} saved to: {output_dir}")
    print(f"Metrics saved to: {metrics_path}")


if __name__ == "__main__":
    main()
