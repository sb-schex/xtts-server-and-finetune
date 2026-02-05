import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const SPEAKERS_DIR = process.env.SPEAKERS_DIR || "/tmp/xtts-speakers";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("audio/")) {
      return NextResponse.json(
        { success: false, error: "Only audio files allowed" },
        { status: 400 }
      );
    }

    // Ensure directory exists
    if (!existsSync(SPEAKERS_DIR)) {
      await mkdir(SPEAKERS_DIR, { recursive: true });
    }

    const filepath = path.join(SPEAKERS_DIR, file.name);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    return NextResponse.json({
      success: true,
      speaker: {
        name: path.parse(file.name).name,
        path: filepath,
        filename: file.name,
      },
    });
  } catch (error) {
    console.error("Speaker upload error:", error);
    return NextResponse.json(
      { success: false, error: "Upload failed" },
      { status: 500 }
    );
  }
}
