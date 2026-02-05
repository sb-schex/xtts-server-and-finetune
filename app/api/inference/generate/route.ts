import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const OUTPUT_DIR = process.env.OUTPUT_DIR || "/tmp/xtts-outputs";

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();

    const {
      text,
      speakerWav,
      language = "ru",
      temperature = 0.7,
      lengthPenalty = 1.0,
      repetitionPenalty = 2.0,
      topK = 50,
      topP = 0.85,
      speed = 1.0,
      modelPath,
    } = config;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { success: false, error: "Text is required" },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL;

    if (backendUrl) {
      // Call backend API for GPU inference
      const response = await fetch(`${backendUrl}/api/inference/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error("Backend inference API error");
      }

      const result = await response.json();
      return NextResponse.json({ success: true, data: result });
    } else {
      // Simulate inference for development
      await new Promise((r) => setTimeout(r, 2000));

      // Ensure output directory exists
      if (!existsSync(OUTPUT_DIR)) {
        await mkdir(OUTPUT_DIR, { recursive: true });
      }

      // Create a dummy WAV file (in production, this would be real audio)
      const outputId = randomUUID();
      const outputPath = path.join(OUTPUT_DIR, `${outputId}.wav`);

      // Create minimal WAV header for simulation
      const sampleRate = 24000;
      const duration = Math.min(text.length * 0.05, 30); // Rough estimate
      const numSamples = Math.floor(sampleRate * duration);

      // WAV header (44 bytes) + silent audio data
      const wavHeader = Buffer.alloc(44);
      wavHeader.write("RIFF", 0);
      wavHeader.writeUInt32LE(36 + numSamples * 2, 4);
      wavHeader.write("WAVE", 8);
      wavHeader.write("fmt ", 12);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20); // PCM
      wavHeader.writeUInt16LE(1, 22); // Mono
      wavHeader.writeUInt32LE(sampleRate, 24);
      wavHeader.writeUInt32LE(sampleRate * 2, 28);
      wavHeader.writeUInt16LE(2, 32);
      wavHeader.writeUInt16LE(16, 34);
      wavHeader.write("data", 36);
      wavHeader.writeUInt32LE(numSamples * 2, 40);

      const audioData = Buffer.alloc(numSamples * 2); // Silent audio
      const wavBuffer = Buffer.concat([wavHeader, audioData]);

      await writeFile(outputPath, wavBuffer);

      return NextResponse.json({
        success: true,
        data: {
          id: outputId,
          audioUrl: `/api/inference/audio/${outputId}.wav`,
          duration,
          text: text.slice(0, 100),
        },
      });
    }
  } catch (error) {
    console.error("Inference error:", error);
    return NextResponse.json(
      { success: false, error: "Inference failed" },
      { status: 500 }
    );
  }
}
