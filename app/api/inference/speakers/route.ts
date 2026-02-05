import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const SPEAKERS_DIR = process.env.SPEAKERS_DIR || "/tmp/xtts-speakers";

export async function GET() {
  try {
    if (!existsSync(SPEAKERS_DIR)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const entries = await readdir(SPEAKERS_DIR);
    const speakers = [];

    for (const entry of entries) {
      if (entry.endsWith(".wav") || entry.endsWith(".mp3")) {
        const entryPath = path.join(SPEAKERS_DIR, entry);
        const stats = await stat(entryPath);

        speakers.push({
          name: path.parse(entry).name,
          path: entryPath,
          filename: entry,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }

    return NextResponse.json({ success: true, data: speakers });
  } catch (error) {
    console.error("List speakers error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list speakers" },
      { status: 500 }
    );
  }
}
