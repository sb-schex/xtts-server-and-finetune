import { NextRequest, NextResponse } from "next/server";
import { stat, createReadStream } from "fs";
import { promisify } from "util";
import path from "path";

const statAsync = promisify(stat);

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/xtts-uploads";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Security: prevent path traversal
    const sanitizedId = path.basename(id);
    const filePath = path.join(UPLOAD_DIR, sanitizedId);

    // Check if file exists
    let fileStats;
    try {
      fileStats = await statAsync(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileSize = fileStats.size;

    // Determine content type based on extension
    const ext = path.extname(sanitizedId).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";

    // Handle Range requests for seeking
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;

      // Create a ReadableStream from the file
      const stream = new ReadableStream({
        async start(controller) {
          const nodeStream = createReadStream(filePath, { start, end });

          nodeStream.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          nodeStream.on("end", () => {
            controller.close();
          });

          nodeStream.on("error", (err) => {
            controller.error(err);
          });
        },
      });

      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
        },
      });
    }

    // Full file response
    const stream = new ReadableStream({
      async start(controller) {
        const nodeStream = createReadStream(filePath);

        nodeStream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        nodeStream.on("end", () => {
          controller.close();
        });

        nodeStream.on("error", (err) => {
          controller.error(err);
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Audio stream error:", error);
    return NextResponse.json(
      { error: "Failed to stream audio" },
      { status: 500 }
    );
  }
}
