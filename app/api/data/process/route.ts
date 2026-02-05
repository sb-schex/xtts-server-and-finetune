import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// In-memory job storage (replace with Redis in production)
const jobs = new Map<string, {
  status: string;
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
}>();

// Export for SSE endpoint
export { jobs };

export async function POST(request: NextRequest) {
  try {
    const { files, language = "ru" } = await request.json();

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files to process" },
        { status: 400 }
      );
    }

    const jobId = randomUUID();

    // Initialize job
    jobs.set(jobId, {
      status: "pending",
      progress: 0,
      message: "Job queued",
    });

    // Start processing in background
    processFilesAsync(jobId, files, language);

    return NextResponse.json({
      success: true,
      jobId,
    });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to start processing" },
      { status: 500 }
    );
  }
}

async function processFilesAsync(
  jobId: string,
  files: Array<{ id: string; path: string; filename: string }>,
  language: string
) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    job.status = "processing";
    job.message = "Starting Whisper transcription...";

    // Use local backend or Modal API
    const backendUrl = process.env.BACKEND_URL || process.env.MODAL_API_URL;

    if (backendUrl) {
      // Call backend API for GPU processing
      const response = await fetch(`${backendUrl}/api/data/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, language }),
      });

      if (!response.ok) {
        throw new Error("Backend API error");
      }

      const data = await response.json();

      // Subscribe to SSE progress if job started
      if (data.jobId) {
        const eventSource = new EventSource(`${backendUrl}/api/data/progress/${data.jobId}`);

        eventSource.onmessage = (event) => {
          try {
            const update = JSON.parse(event.data);
            job.progress = update.progress || job.progress;
            job.message = update.message || job.message;

            if (update.status === "completed") {
              job.status = "completed";
              job.result = update.result;
              eventSource.close();
            } else if (update.status === "failed") {
              job.status = "failed";
              job.error = update.error;
              eventSource.close();
            }
          } catch {
            // Ignore parse errors
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
        };
      } else {
        // Direct result
        job.status = "completed";
        job.progress = 100;
        job.message = "Processing complete";
        job.result = data.result || data;
      }
    } else {
      // Simulate processing for development (no backend)
      const totalFiles = files.length;

      for (let i = 0; i < totalFiles; i++) {
        job.progress = Math.round(((i + 1) / totalFiles) * 100);
        job.message = `Processing file ${i + 1}/${totalFiles}: ${files[i].filename}`;
        await new Promise((r) => setTimeout(r, 2000));
      }

      job.status = "completed";
      job.progress = 100;
      job.message = "Processing complete";
      job.result = {
        datasetId: jobId.slice(0, 8),
        filesProcessed: totalFiles,
        language,
        segments: files.map((f) => ({
          audioId: f.id,
          filename: f.filename,
          transcription: `[Simulated transcription for ${f.filename}]`,
          segments: [
            { start: 0, end: 5, text: "Sample segment 1" },
            { start: 5, end: 10, text: "Sample segment 2" },
          ],
        })),
      };
    }
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Processing failed";
    job.message = job.error;
  }
}
