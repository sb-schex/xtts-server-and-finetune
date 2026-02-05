import { NextRequest } from "next/server";
import { chunkingJobs } from "../../route";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll for updates
      let lastProgress = -1;
      let lastMessage = "";
      const maxWait = 3600000; // 1 hour timeout for long audio
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const job = chunkingJobs.get(jobId);

        if (!job) {
          sendEvent({ error: "Job not found" });
          controller.close();
          return;
        }

        // Send update if state changed
        if (
          job.progress !== lastProgress ||
          job.message !== lastMessage ||
          job.status === "completed" ||
          job.status === "failed"
        ) {
          lastProgress = job.progress;
          lastMessage = job.message;

          sendEvent({
            status: job.status,
            progress: job.progress,
            message: job.message,
            currentChunk: job.currentChunk,
            totalChunks: job.totalChunks,
            result: job.result,
            error: job.error,
          });

          // Close stream on completion
          if (job.status === "completed" || job.status === "failed") {
            controller.enqueue(encoder.encode(`event: complete\ndata: {}\n\n`));
            controller.close();

            // Cleanup job after 5 minutes
            setTimeout(() => chunkingJobs.delete(jobId), 300000);
            return;
          }
        }

        // Wait before next poll
        await new Promise((r) => setTimeout(r, 500));
      }

      // Timeout
      sendEvent({ error: "Timeout" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
