import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/xtts-uploads";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files provided" },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const uploaded = [];

    for (const file of files) {
      // Validate audio file
      if (!file.type.startsWith("audio/")) {
        continue;
      }

      const fileId = randomUUID();
      const ext = path.extname(file.name) || ".wav";
      const filename = `${fileId}${ext}`;
      const filepath = path.join(UPLOAD_DIR, filename);

      // Save file
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filepath, buffer);

      uploaded.push({
        id: fileId,
        filename: file.name,
        savedAs: filename,
        size: buffer.length,
        path: filepath,
      });
    }

    return NextResponse.json({
      success: true,
      files: uploaded,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Upload failed" },
      { status: 500 }
    );
  }
}
