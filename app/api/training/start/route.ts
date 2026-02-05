import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// Training jobs storage
const trainingJobs = new Map<string, {
  status: string;
  epoch: number;
  totalEpochs: number;
  step: number;
  loss: number;
  metrics: Array<{ epoch: number; step: number; loss: number; timestamp: string }>;
  error?: string;
  modelPath?: string;
}>();

export { trainingJobs };

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();

    const {
      datasetPath,
      epochs = 10,
      batchSize = 4,
      learningRate = 5e-6,
      gradAccumSteps = 1,
      maxAudioLength = 11,
    } = config;

    if (!datasetPath) {
      return NextResponse.json(
        { success: false, error: "Dataset path required" },
        { status: 400 }
      );
    }

    const jobId = randomUUID();

    trainingJobs.set(jobId, {
      status: "pending",
      epoch: 0,
      totalEpochs: epochs,
      step: 0,
      loss: 0,
      metrics: [],
    });

    // Start training in background
    runTrainingAsync(jobId, {
      datasetPath,
      epochs,
      batchSize,
      learningRate,
      gradAccumSteps,
      maxAudioLength,
    });

    return NextResponse.json({
      success: true,
      jobId,
    });
  } catch (error) {
    console.error("Training start error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to start training" },
      { status: 500 }
    );
  }
}

async function runTrainingAsync(
  jobId: string,
  config: {
    datasetPath: string;
    epochs: number;
    batchSize: number;
    learningRate: number;
    gradAccumSteps: number;
    maxAudioLength: number;
  }
) {
  const job = trainingJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "training";

    const modalApiUrl = process.env.MODAL_API_URL;

    if (modalApiUrl) {
      // Call Modal API for GPU training
      const response = await fetch(`${modalApiUrl}/api/training/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error("Modal training API error");
      }

      // Stream training progress from Modal
      // TODO: implement SSE forwarding from Modal
    } else {
      // Simulate training for development
      const stepsPerEpoch = 100;

      for (let epoch = 1; epoch <= config.epochs; epoch++) {
        for (let step = 1; step <= stepsPerEpoch; step += 10) {
          // Simulate loss decrease with noise
          const baseLoss = 2.5 - (epoch - 1) * 0.15 - (step / stepsPerEpoch) * 0.1;
          const loss = baseLoss + (Math.random() - 0.5) * 0.2;

          job.epoch = epoch;
          job.step = (epoch - 1) * stepsPerEpoch + step;
          job.loss = Math.max(0.5, loss);

          job.metrics.push({
            epoch,
            step: job.step,
            loss: job.loss,
            timestamp: new Date().toISOString(),
          });

          await new Promise((r) => setTimeout(r, 200));
        }
      }

      job.status = "completed";
      job.modelPath = `/tmp/xtts-models/${jobId.slice(0, 8)}`;
    }
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Training failed";
  }
}
