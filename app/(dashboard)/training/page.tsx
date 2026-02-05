"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Download, Loader2, AlertCircle } from "lucide-react";

interface TrainingMetric {
  epoch: number;
  step: number;
  loss: number;
  timestamp: string;
}

interface Dataset {
  name: string;
  path: string;
}

export default function TrainingPage() {
  const [training, setTraining] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(10);
  const [step, setStep] = useState(0);
  const [loss, setLoss] = useState(0);
  const [metrics, setMetrics] = useState<TrainingMetric[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modelPath, setModelPath] = useState<string | null>(null);

  const [config, setConfig] = useState({
    datasetPath: "",
    epochs: 10,
    batchSize: 4,
    learningRate: 5e-6,
    gradAccumSteps: 1,
    maxAudioLength: 11,
  });

  // Load datasets on mount
  useEffect(() => {
    fetch("/api/data/datasets")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDatasets(data.data);
        }
      })
      .catch(console.error);
  }, []);

  const startTraining = async () => {
    if (!config.datasetPath) {
      setError("Please select a dataset");
      return;
    }

    setTraining(true);
    setEpoch(0);
    setStep(0);
    setMetrics([]);
    setError(null);
    setModelPath(null);
    setTotalEpochs(config.epochs);

    try {
      const response = await fetch("/api/training/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to start training");
      }

      // Subscribe to SSE for progress
      const eventSource = new EventSource(`/api/training/progress/${data.jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);

          if (update.error) {
            throw new Error(update.error);
          }

          setEpoch(update.epoch || 0);
          setTotalEpochs(update.totalEpochs || config.epochs);
          setStep(update.step || 0);
          setLoss(update.loss || 0);

          if (update.metrics) {
            setMetrics(update.metrics);
          }

          if (update.status === "completed") {
            setModelPath(update.modelPath);
            eventSource.close();
            setTraining(false);
          } else if (update.status === "failed") {
            throw new Error(update.error || "Training failed");
          }
        } catch (err) {
          eventSource.close();
          setError(err instanceof Error ? err.message : "Training failed");
          setTraining(false);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setError("Connection lost");
        setTraining(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start training");
      setTraining(false);
    }
  };

  const stopTraining = async () => {
    // TODO: implement stop endpoint
    setTraining(false);
  };

  const progress = totalEpochs > 0 ? (epoch / totalEpochs) * 100 : 0;
  const bestLoss = metrics.length > 0 ? Math.min(...metrics.map((m) => m.loss)) : 0;

  // Simple loss chart as bars
  const chartMetrics = metrics.slice(-30);
  const maxLoss = Math.max(...chartMetrics.map((m) => m.loss), 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Обучение модели</h1>
        <p className="text-muted-foreground">
          Настройте параметры и запустите fine-tuning XTTS v2
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Training Config */}
        <Card>
          <CardHeader>
            <CardTitle>Параметры обучения</CardTitle>
            <CardDescription>Настройте гиперпараметры модели</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Датасет</Label>
              <Select
                value={config.datasetPath}
                onValueChange={(v) => setConfig({ ...config, datasetPath: v })}
                disabled={training}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите датасет" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.length > 0 ? (
                    datasets.map((ds) => (
                      <SelectItem key={ds.path} value={ds.path}>
                        {ds.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Нет доступных датасетов
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Эпохи</Label>
                <span className="text-sm text-muted-foreground">
                  {config.epochs}
                </span>
              </div>
              <Slider
                value={[config.epochs]}
                onValueChange={([v]) => setConfig({ ...config, epochs: v })}
                min={1}
                max={100}
                step={1}
                disabled={training}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Batch Size</Label>
                <span className="text-sm text-muted-foreground">
                  {config.batchSize}
                </span>
              </div>
              <Slider
                value={[config.batchSize]}
                onValueChange={([v]) => setConfig({ ...config, batchSize: v })}
                min={1}
                max={16}
                step={1}
                disabled={training}
              />
            </div>

            <div className="space-y-2">
              <Label>Learning Rate</Label>
              <Input
                type="number"
                value={config.learningRate}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    learningRate: parseFloat(e.target.value) || 5e-6,
                  })
                }
                step={0.000001}
                disabled={training}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Gradient Accumulation</Label>
                <span className="text-sm text-muted-foreground">
                  {config.gradAccumSteps}
                </span>
              </div>
              <Slider
                value={[config.gradAccumSteps]}
                onValueChange={([v]) =>
                  setConfig({ ...config, gradAccumSteps: v })
                }
                min={1}
                max={8}
                step={1}
                disabled={training}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Max Audio Length (sec)</Label>
                <span className="text-sm text-muted-foreground">
                  {config.maxAudioLength}
                </span>
              </div>
              <Slider
                value={[config.maxAudioLength]}
                onValueChange={([v]) =>
                  setConfig({ ...config, maxAudioLength: v })
                }
                min={2}
                max={20}
                step={1}
                disabled={training}
              />
            </div>

            <div className="flex gap-2">
              {!training ? (
                <Button className="flex-1" onClick={startTraining}>
                  <Play className="h-4 w-4 mr-2" />
                  Начать обучение
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={stopTraining}
                >
                  <Square className="h-4 w-4 mr-2" />
                  Остановить
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Training Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Прогресс обучения</CardTitle>
            <CardDescription>Метрики в реальном времени</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  Эпоха {epoch} / {totalEpochs}
                </span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} />
              {training && (
                <p className="text-xs text-muted-foreground">
                  Step: {step} | Loss: {loss.toFixed(4)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Current Loss</p>
                <p className="text-2xl font-bold">
                  {loss > 0 ? loss.toFixed(4) : "-"}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Best Loss</p>
                <p className="text-2xl font-bold">
                  {bestLoss > 0 ? bestLoss.toFixed(4) : "-"}
                </p>
              </div>
            </div>

            {/* Loss Chart */}
            <div className="h-32 bg-muted rounded-lg p-2 flex items-end gap-0.5">
              {chartMetrics.length > 0 ? (
                chartMetrics.map((m, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-primary rounded-t transition-all"
                    style={{
                      height: `${Math.min((m.loss / maxLoss) * 100, 100)}%`,
                      opacity: 0.5 + (i / chartMetrics.length) * 0.5,
                    }}
                    title={`Step ${m.step}: ${m.loss.toFixed(4)}`}
                  />
                ))
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  {training ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "График появится при обучении"
                  )}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={!modelPath}
            >
              <Download className="h-4 w-4 mr-2" />
              {modelPath ? "Скачать модель" : "Модель будет доступна после обучения"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
