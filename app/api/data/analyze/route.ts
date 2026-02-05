import { NextRequest, NextResponse } from "next/server";
import { AudioRange, VADConfig, ChunkingPreview, ChunkInfo } from "@/lib/types";

interface AnalyzeRequest {
  audioId: string;
  audioPath: string;
  range: AudioRange;
  vadConfig: VADConfig;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { audioId, audioPath, range, vadConfig } = body;

    if (!audioId || !audioPath) {
      return NextResponse.json(
        { success: false, error: "Missing audioId or audioPath" },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL;

    if (backendUrl) {
      // Call backend API for VAD analysis
      const response = await fetch(`${backendUrl}/api/data/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioPath,
          range,
          vadConfig,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend API error: ${error}`);
      }

      const result = await response.json();
      return NextResponse.json({
        success: true,
        preview: result.preview,
      });
    } else {
      // Simulate VAD analysis for development
      const duration = range.end - range.start;
      const avgChunkDuration = vadConfig.targetChunkDuration;
      const totalChunks = Math.max(1, Math.round(duration / avgChunkDuration));

      const chunks: ChunkInfo[] = [];
      let currentTime = range.start;

      for (let i = 0; i < totalChunks; i++) {
        // Add some randomness to make it realistic
        const chunkDuration = avgChunkDuration + (Math.random() - 0.5) * 4;
        const clampedDuration = Math.max(
          vadConfig.minChunkDuration,
          Math.min(vadConfig.maxChunkDuration, chunkDuration)
        );

        const end = Math.min(currentTime + clampedDuration, range.end);

        chunks.push({
          id: `chunk_${i}`,
          index: i,
          start: currentTime,
          end: end,
          duration: end - currentTime,
        });

        currentTime = end;
        if (currentTime >= range.end) break;
      }

      const durations = chunks.map((c) => c.duration);
      const preview: ChunkingPreview = {
        chunks,
        totalChunks: chunks.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
      };

      return NextResponse.json({
        success: true,
        preview,
      });
    }
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      },
      { status: 500 }
    );
  }
}
