import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import joblib
import pandas as pd

from data_engine import predictor, train_model


class PredictionPipelineTest(unittest.TestCase):
    def test_train_save_load_and_generate_predictions(self):
        end = pd.Timestamp.now(tz="UTC").floor("h").tz_localize(None)
        timestamps = pd.date_range(end=end, periods=96, freq="h")
        snapshots = pd.DataFrame({
            "station_id": 17,
            "timestamp": timestamps,
            "available_bikes": [8 + (index % 9) for index in range(len(timestamps))],
            "total_capacity": 20,
        })

        processed = train_model.create_features_vectorized(snapshots, pd.DataFrame())
        self.assertFalse(processed[train_model.MODEL_FEATURES].isna().any().any())

        history = processed[["station_id", "timestamp", "available_bikes"]].tail(30).copy()
        history["timestamp"] = history["timestamp"].dt.tz_localize("UTC")

        class FakeTable:
            def __init__(self):
                self.rows = []
                self.pending = []

            def upsert(self, rows, on_conflict):
                self.pending = rows
                return self

            def execute(self):
                self.rows.extend(self.pending)

        class FakeSupabase:
            def __init__(self):
                self.predictions = FakeTable()

            def table(self, name):
                self_test.assertEqual(name, "predicciones")
                return self.predictions

        self_test = self
        supabase = FakeSupabase()
        with tempfile.TemporaryDirectory() as model_dir:
            def run_sequentially(**kwargs):
                def execute(tasks):
                    return [function(*args, **task_kwargs) for function, args, task_kwargs in tasks]
                return execute

            with patch.object(train_model, "MODEL_DIR", model_dir), \
                    patch.object(train_model, "fetch_data", return_value=snapshots), \
                    patch.object(train_model, "fetch_weather", return_value=pd.DataFrame()), \
                    patch.object(train_model.joblib, "Parallel", side_effect=run_sequentially):
                train_model.main()

            model_path = Path(model_dir) / "models.pkl"
            self.assertTrue(model_path.is_file())
            saved_artifact = joblib.load(model_path)
            self.assertEqual(saved_artifact["features"], train_model.MODEL_FEATURES)

            with (
                patch.object(predictor, "MODEL_DIR", model_dir),
                patch.object(predictor, "fetch_recent_history", return_value=history),
                patch.object(predictor, "fetch_weather_forecast", return_value=None),
                patch.object(predictor, "get_supabase", return_value=supabase),
            ):
                predictor.main()

        self.assertEqual(len(supabase.predictions.rows), 24)
        self.assertTrue(all(row["station_id"] == 17 for row in supabase.predictions.rows))
        self.assertTrue(all(0 <= row["predicted_bikes"] <= 20 for row in supabase.predictions.rows))
        self.assertTrue(all(datetime.fromisoformat(row["prediction_date"]).tzinfo is not None for row in supabase.predictions.rows))

    def test_missing_model_fails(self):
        with tempfile.TemporaryDirectory() as model_dir:
            with patch.object(predictor, "MODEL_DIR", model_dir):
                with self.assertRaises(FileNotFoundError):
                    predictor.main()


if __name__ == "__main__":
    unittest.main()