import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MODELS_DIR = process.env.MODELS_DIR || "/tmp/xtts-models";

export async function GET() {
  try {
    if (!existsSync(MODELS_DIR)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const entries = await readdir(MODELS_DIR);
    const models = [];

    for (const entry of entries) {
      const entryPath = path.join(MODELS_DIR, entry);
      const stats = await stat(entryPath);

      if (stats.isDirectory()) {
        // Check if it has model files
        const modelFiles = await readdir(entryPath).catch(() => []);
        const hasModelPth = modelFiles.some((f) => f.endsWith(".pth"));

        if (hasModelPth) {
          models.push({
            name: entry,
            path: entryPath,
            isDirectory: true,
            modifiedAt: stats.mtime.toISOString(),
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: models });
  } catch (error) {
    console.error("List models error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list models" },
      { status: 500 }
    );
  }
}
