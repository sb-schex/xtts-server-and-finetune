import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DATASETS_DIR = process.env.DATASETS_DIR || "/tmp/xtts-datasets";

export async function GET() {
  try {
    if (!existsSync(DATASETS_DIR)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const entries = await readdir(DATASETS_DIR);
    const datasets = [];

    for (const entry of entries) {
      const entryPath = path.join(DATASETS_DIR, entry);
      const stats = await stat(entryPath);

      if (stats.isDirectory()) {
        datasets.push({
          name: entry,
          path: entryPath,
          isDirectory: true,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }

    return NextResponse.json({ success: true, data: datasets });
  } catch (error) {
    console.error("List datasets error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list datasets" },
      { status: 500 }
    );
  }
}
