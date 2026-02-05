import { NextRequest } from "next/server";
import { trainingJobs } from "../../start/route";

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

      let lastStep = -1;
      const maxWait = 7200000; // 2 hours timeout for training
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const job = trainingJobs.get(jobId);

        if (!job) {
          sendEvent({ error: "Job not found" });
          controller.close();
          return;
        }

        // Send update if step changed
        if (job.step !== lastStep || job.status === "completed" || job.status === "failed") {
          lastStep = job.step;

          sendEvent({
            status: job.status,
            epoch: job.epoch,
            totalEpochs: job.totalEpochs,
            step: job.step,
            loss: job.loss,
            metrics: job.metrics.slice(-50), // Last 50 metrics
            modelPath: job.modelPath,
            error: job.error,
          });

          if (job.status === "completed" || job.status === "failed") {
            controller.enqueue(encoder.encode(`event: complete\ndata: {}\n\n`));
            controller.close();

            // Cleanup job after 5 minutes
            setTimeout(() => trainingJobs.delete(jobId), 300000);
            return;
          }
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

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
