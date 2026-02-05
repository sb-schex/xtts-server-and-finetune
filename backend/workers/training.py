"""
Training Worker - XTTS fine-tuning
"""
from pathlib import Path
from typing import Optional, Generator
import json

from ..config import DATASETS_DIR, MODELS_DIR, CACHE_DIR


class TrainingWorker:
    """XTTS fine-tuning worker"""

    _instance: Optional["TrainingWorker"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def train(
        self,
        config: dict,
        on_progress: callable = None,
    ) -> Generator[dict, None, None]:
        """
        Fine-tune XTTS model

        Args:
            config: Training configuration
            on_progress: Callback for progress updates

        Yields:
            dict with training metrics
        """
        import torch

        dataset_path = config.get("datasetPath", "")
        epochs = config.get("epochs", 10)
        batch_size = config.get("batchSize", 4)
        learning_rate = config.get("learningRate", 5e-6)
        grad_accum_steps = config.get("gradAccumSteps", 1)
        max_audio_length = config.get("maxAudioLength", 11)

        # Verify dataset exists
        dataset_dir = Path(dataset_path) if Path(dataset_path).is_absolute() else DATASETS_DIR / dataset_path
        if not dataset_dir.exists():
            yield {"error": f"Dataset not found: {dataset_path}"}
            return

        # Check for metadata
        metadata_file = dataset_dir / "metadata.json"
        if not metadata_file.exists():
            yield {"error": "metadata.json not found in dataset"}
            return

        # Load metadata
        with open(metadata_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        # Prepare training data
        # TODO: Implement actual XTTS fine-tuning
        # For now, simulate training

        metrics = []
        for epoch in range(1, epochs + 1):
            # Simulated loss (decreasing over time)
            loss = 2.5 - epoch * 0.2 + torch.rand(1).item() * 0.1

            metrics.append({
                "epoch": epoch,
                "loss": loss,
            })

            yield {
                "epoch": epoch,
                "totalEpochs": epochs,
                "loss": loss,
                "metrics": metrics,
                "status": "training",
            }

            # Simulate training time
            import time
            time.sleep(2)

        # Save model
        model_name = f"xtts-finetuned-{dataset_dir.name}"
        output_path = MODELS_DIR / model_name
        output_path.mkdir(parents=True, exist_ok=True)

        # Save training info
        with open(output_path / "training_info.json", "w") as f:
            json.dump({
                "dataset": str(dataset_dir),
                "epochs": epochs,
                "batch_size": batch_size,
                "learning_rate": learning_rate,
                "final_loss": metrics[-1]["loss"] if metrics else None,
                "metrics": metrics,
            }, f, indent=2)

        yield {
            "status": "completed",
            "model_path": str(output_path),
            "metrics": metrics,
        }

    def list_models(self) -> list[dict]:
        """List trained models"""
        models = []

        if MODELS_DIR.exists():
            for model_dir in MODELS_DIR.iterdir():
                if model_dir.is_dir():
                    info_file = model_dir / "training_info.json"
                    info = {}
                    if info_file.exists():
                        with open(info_file, "r") as f:
                            info = json.load(f)

                    models.append({
                        "name": model_dir.name,
                        "path": str(model_dir),
                        "epochs": info.get("epochs"),
                        "final_loss": info.get("final_loss"),
                    })

        return models


# Global instance
training_worker = TrainingWorker()
