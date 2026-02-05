import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { AudioRange, VADConfig, ChunkingResult } from "@/lib/types";

interface ChunkRequest {
  audioId: string;
  audioPath: string;
  range: AudioRange;
  vadConfig: VADConfig;
  autoTranscribe: boolean;
  language: string;
}

// In-memory job storage for chunking jobs
export const chunkingJobs = new Map<
  string,
  {
    status: string;
    progress: number;
    message: string;
    currentChunk?: number;
    totalChunks?: number;
    result?: ChunkingResult;
    error?: string;
  }
>();

export async function POST(request: NextRequest) {
  try {
    const body: ChunkRequest = await request.json();
    const { audioId, audioPath, range, vadConfig, autoTranscribe, language } = body;

    if (!audioId || !audioPath) {
      return NextResponse.json(
        { success: false, error: "Missing audioId or audioPath" },
        { status: 400 }
      );
    }

    const jobId = randomUUID();

    // Initialize job
    chunkingJobs.set(jobId, {
      status: "pending",
      progress: 0,
      message: "Job queued",
    });

    // Start processing in background
    processChunkingAsync(jobId, {
      audioId,
      audioPath,
      range,
      vadConfig,
      autoTranscribe,
      language,
    });

    return NextResponse.json({
      success: true,
      jobId,
    });
  } catch (error) {
    console.error("Chunk error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to start chunking" },
      { status: 500 }
    );
  }
}

async function processChunkingAsync(jobId: string, params: ChunkRequest) {
  const job = chunkingJobs.get(jobId);
  if (!job) return;

  const { audioPath, range, vadConfig, autoTranscribe, language } = params;

  try {
    job.status = "analyzing";
    job.message = "Analyzing audio with VAD...";
    job.progress = 5;

    const backendUrl = process.env.BACKEND_URL || process.env.MODAL_API_URL;

    if (backendUrl) {
      // Call backend API for chunking
      job.message = "Starting VAD chunking on GPU...";
      job.progress = 10;

      const response = await fetch(`${backendUrl}/api/data/chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioPath,
          range,
          vadConfig,
          autoTranscribe,
          language,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Modal API error: ${error}`);
      }

      // Stream progress updates from Modal
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.progress !== undefined) {
                  job.progress = data.progress;
                }
                if (data.message) {
                  job.message = data.message;
                }
                if (data.currentChunk !== undefined) {
                  job.currentChunk = data.currentChunk;
                }
                if (data.totalChunks !== undefined) {
                  job.totalChunks = data.totalChunks;
                }
                if (data.result) {
                  job.result = data.result;
                }
                if (data.status === "completed") {
                  job.status = "completed";
                }
                if (data.status === "failed") {
                  job.status = "failed";
                  job.error = data.error;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } else {
        // Fallback: get result directly
        const result = await response.json();
        job.status = "completed";
        job.progress = 100;
        job.message = "Chunking complete";
        job.result = result;
      }
    } else {
      // Simulate chunking for development
      const duration = range.end - range.start;
      const avgChunkDuration = vadConfig.targetChunkDuration;
      const totalChunks = Math.max(1, Math.round(duration / avgChunkDuration));

      job.totalChunks = totalChunks;

      // Simulate VAD analysis
      await new Promise((r) => setTimeout(r, 1000));
      job.status = "chunking";
      job.message = "Splitting audio into chunks...";
      job.progress = 20;

      const chunks: ChunkingResult["chunks"] = [];

      for (let i = 0; i < totalChunks; i++) {
        job.currentChunk = i + 1;
        job.progress = 20 + Math.round((60 * (i + 1)) / totalChunks);
        job.message = `Processing chunk ${i + 1}/${totalChunks}...`;

        // Simulate chunk processing
        await new Promise((r) => setTimeout(r, 500));

        const chunkDuration = avgChunkDuration + (Math.random() - 0.5) * 4;
        chunks.push({
          filename: `chunk_${String(i + 1).padStart(3, "0")}.wav`,
          duration: Math.max(
            vadConfig.minChunkDuration,
            Math.min(vadConfig.maxChunkDuration, chunkDuration)
          ),
          transcription: autoTranscribe
            ? `[Simulated transcription for chunk ${i + 1}]`
            : undefined,
        });
      }

      if (autoTranscribe) {
        job.status = "transcribing";
        job.message = "Transcribing chunks with Whisper...";
        job.progress = 85;
        await new Promise((r) => setTimeout(r, 2000));
      }

      job.status = "completed";
      job.progress = 100;
      job.message = "Chunking complete";
      job.result = {
        datasetId: `dataset_${jobId.slice(0, 8)}`,
        chunks,
      };
    }
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Chunking failed";
    job.message = job.error;
  }
}
