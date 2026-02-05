import { NextRequest } from "next/server";
import { jobs } from "../../process/route";

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
      const maxWait = 300000; // 5 minutes timeout
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const job = jobs.get(jobId);

        if (!job) {
          sendEvent({ error: "Job not found" });
          controller.close();
          return;
        }

        // Send update if progress changed
        if (job.progress !== lastProgress || job.status === "completed" || job.status === "failed") {
          lastProgress = job.progress;
          sendEvent({
            status: job.status,
            progress: job.progress,
            message: job.message,
            result: job.result,
            error: job.error,
          });

          // Close stream on completion
          if (job.status === "completed" || job.status === "failed") {
            controller.enqueue(encoder.encode(`event: complete\ndata: {}\n\n`));
            controller.close();

            // Cleanup job after sending
            setTimeout(() => jobs.delete(jobId), 60000);
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
