"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  FileAudio,
  Play,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Scissors,
  Clock,
} from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/utils";
import { LongAudioProcessor } from "@/components/audio/LongAudioProcessor";
import { ChunkingResult } from "@/lib/types";

interface UploadedFile {
  id: string;
  filename: string;
  savedAs?: string;
  size: number;
  path?: string;
  duration?: number;
  status: "pending" | "uploading" | "uploaded" | "processing" | "done" | "error";
  error?: string;
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

interface ProcessingResult {
  datasetId: string;
  filesProcessed: number;
  language: string;
  segments: Array<{
    audioId: string;
    filename: string;
    transcription: string;
    segments: TranscriptionSegment[];
  }>;
}

// Threshold for suggesting long audio mode (60 seconds)
const LONG_AUDIO_THRESHOLD = 60;

export default function DataProcessingPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [language, setLanguage] = useState("ru");
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Long audio processing state
  const [selectedLongAudio, setSelectedLongAudio] = useState<UploadedFile | null>(null);
  const [chunkingResults, setChunkingResults] = useState<ChunkingResult[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const uploadFiles = async (fileList: File[]) => {
    setUploading(true);
    setError(null);

    const formData = new FormData();
    fileList.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/data/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        const uploaded: UploadedFile[] = data.files.map((f: {
          id: string;
          filename: string;
          savedAs: string;
          size: number;
          path: string;
          duration?: number;
        }) => ({
          id: f.id,
          filename: f.filename,
          savedAs: f.savedAs,
          size: f.size,
          path: f.path,
          duration: f.duration,
          status: "uploaded" as const,
        }));
        setFiles((prev) => [...prev, ...uploaded]);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Failed to upload files");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("audio/")
    );

    if (droppedFiles.length > 0) {
      uploadFiles(droppedFiles);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedLongAudio?.id === id) {
      setSelectedLongAudio(null);
    }
  };

  const startProcessing = async () => {
    const uploadedFiles = files.filter((f) => f.status === "uploaded");
    if (uploadedFiles.length === 0) return;

    setProcessing(true);
    setProgress(0);
    setProgressMessage("Starting...");
    setError(null);
    setResult(null);

    try {
      // Start processing job
      const response = await fetch("/api/data/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: uploadedFiles.map((f) => ({
            id: f.id,
            path: f.path,
            filename: f.filename,
          })),
          language,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to start processing");
      }

      // Subscribe to SSE for progress
      const eventSource = new EventSource(`/api/data/progress/${data.jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);

          if (update.error) {
            throw new Error(update.error);
          }

          setProgress(update.progress || 0);
          setProgressMessage(update.message || "Processing...");

          if (update.status === "completed") {
            setResult(update.result);
            setFiles((prev) =>
              prev.map((f) =>
                f.status === "uploaded" ? { ...f, status: "done" } : f
              )
            );
            eventSource.close();
            setProcessing(false);
          } else if (update.status === "failed") {
            throw new Error(update.error || "Processing failed");
          }
        } catch (err) {
          eventSource.close();
          setError(err instanceof Error ? err.message : "Processing failed");
          setProcessing(false);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setError("Connection lost");
        setProcessing(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process");
      setProcessing(false);
    }
  };

  const handleLongAudioSelect = (file: UploadedFile) => {
    setSelectedLongAudio(file);
  };

  const handleChunkingComplete = (result: ChunkingResult | undefined) => {
    if (result) {
      setChunkingResults((prev) => [...prev, result]);
      // Mark file as done
      if (selectedLongAudio) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === selectedLongAudio.id ? { ...f, status: "done" } : f
          )
        );
      }
    }
    setSelectedLongAudio(null);
  };

  const uploadedCount = files.filter((f) => f.status === "uploaded").length;
  const doneCount = files.filter((f) => f.status === "done").length;

  // Check if any uploaded file might be long audio
  const hasLongAudio = files.some(
    (f) => f.status === "uploaded" && f.duration && f.duration > LONG_AUDIO_THRESHOLD
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Processing</h1>
        <p className="text-muted-foreground">
          Upload audio files to create a dataset via Whisper transcription
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Long Audio Processor Modal/Overlay */}
      {selectedLongAudio && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl">
            <LongAudioProcessor
              audioId={selectedLongAudio.id}
              audioPath={selectedLongAudio.path || ""}
              audioUrl={`/api/data/audio/${selectedLongAudio.savedAs || selectedLongAudio.id}`}
              filename={selectedLongAudio.filename}
              onComplete={handleChunkingComplete}
              onCancel={() => setSelectedLongAudio(null)}
            />
          </div>
        </div>
      )}

      <Tabs defaultValue="short" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="short" className="flex items-center gap-2">
            <FileAudio className="h-4 w-4" />
            Short Files
          </TabsTrigger>
          <TabsTrigger value="long" className="flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Long Audio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="short" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upload Area */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Audio</CardTitle>
                <CardDescription>
                  Drag and drop files or click to select
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="mx-auto h-10 w-10 text-muted-foreground mb-4 animate-spin" />
                  ) : (
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
                  )}
                  <p className="text-sm text-muted-foreground mb-2">
                    WAV, MP3, FLAC, OGG
                  </p>
                  <label>
                    <input
                      type="file"
                      className="hidden"
                      accept="audio/*"
                      multiple
                      onChange={handleFileInput}
                      disabled={uploading || processing}
                    />
                    <Button variant="secondary" asChild disabled={uploading}>
                      <span>{uploading ? "Uploading..." : "Select Files"}</span>
                    </Button>
                  </label>
                </div>

                {files.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileAudio className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {file.filename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(file.size)}
                              {file.duration && ` | ${formatDuration(file.duration)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {file.status === "done" && (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          {file.status === "error" && (
                            <AlertCircle className="h-5 w-5 text-destructive" />
                          )}
                          {file.status === "processing" && (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          )}
                          {file.status === "uploaded" && file.duration && file.duration > LONG_AUDIO_THRESHOLD && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLongAudioSelect(file)}
                              className="text-xs"
                            >
                              <Scissors className="h-3 w-3 mr-1" />
                              Split
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFile(file.id)}
                            disabled={processing}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Processing Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Processing Settings</CardTitle>
                <CardDescription>
                  Whisper transcription and segmentation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Audio Language</label>
                  <Select
                    value={language}
                    onValueChange={setLanguage}
                    disabled={processing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">Russian</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="pl">Polish</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 bg-muted rounded-lg space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Uploaded files:</span>
                    <span className="font-medium">{uploadedCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Processed:</span>
                    <span className="font-medium">{doneCount}</span>
                  </div>
                </div>

                {hasLongAudio && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                    <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Some files are longer than {LONG_AUDIO_THRESHOLD}s. Consider using the "Long Audio" tab to split them into chunks.
                    </p>
                  </div>
                )}

                {processing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{progressMessage}</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={startProcessing}
                  disabled={uploadedCount === 0 || processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start Processing
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Dataset Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Transcription Results</CardTitle>
              <CardDescription>
                {result
                  ? `Dataset: ${result.datasetId} | ${result.filesProcessed} files | Language: ${result.language}`
                  : "Upload and process audio to create a dataset"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-4">
                  {result.segments.map((seg, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{seg.filename}</span>
                        <span className="text-xs text-muted-foreground">
                          {seg.segments.length} segments
                        </span>
                      </div>
                      <div className="space-y-1">
                        {seg.segments.map((s, i) => (
                          <div
                            key={i}
                            className="text-sm p-2 bg-muted rounded flex gap-4"
                          >
                            <span className="text-muted-foreground text-xs whitespace-nowrap">
                              {s.start.toFixed(1)}s - {s.end.toFixed(1)}s
                            </span>
                            <span>{s.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  {processing
                    ? "Processing..."
                    : "Upload and process audio to create a dataset"}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="long" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upload Area for Long Audio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5" />
                  Long Audio Upload
                </CardTitle>
                <CardDescription>
                  Upload long audio files to split into training-ready chunks using VAD
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="mx-auto h-10 w-10 text-muted-foreground mb-4 animate-spin" />
                  ) : (
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
                  )}
                  <p className="text-sm text-muted-foreground mb-2">
                    WAV, MP3, FLAC, OGG (any length)
                  </p>
                  <label>
                    <input
                      type="file"
                      className="hidden"
                      accept="audio/*"
                      onChange={handleFileInput}
                      disabled={uploading}
                    />
                    <Button variant="secondary" asChild disabled={uploading}>
                      <span>{uploading ? "Uploading..." : "Select Audio File"}</span>
                    </Button>
                  </label>
                </div>

                {/* List of uploaded files for long audio processing */}
                {files.filter((f) => f.status === "uploaded").length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium mb-2">Select a file to process:</p>
                    {files
                      .filter((f) => f.status === "uploaded")
                      .map((file) => (
                        <button
                          key={file.id}
                          onClick={() => handleLongAudioSelect(file)}
                          className="w-full flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileAudio className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {file.filename}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatBytes(file.size)}
                                {file.duration && ` | ${formatDuration(file.duration)}`}
                              </p>
                            </div>
                          </div>
                          <Scissors className="h-4 w-4 text-primary" />
                        </button>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
                <CardDescription>
                  Smart chunking with Voice Activity Detection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-sm">Upload Long Audio</p>
                      <p className="text-xs text-muted-foreground">
                        Supports podcasts, interviews, audiobooks, etc.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-sm">Select Range</p>
                      <p className="text-xs text-muted-foreground">
                        Choose the portion you want to process
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-sm">VAD Analysis</p>
                      <p className="text-xs text-muted-foreground">
                        Silero VAD detects speech segments and pauses
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-sm">Smart Chunking</p>
                      <p className="text-xs text-muted-foreground">
                        Splits at natural pauses, 6-15 seconds per chunk
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      5
                    </div>
                    <div>
                      <p className="font-medium text-sm">Auto Transcription</p>
                      <p className="text-xs text-muted-foreground">
                        Optional Whisper transcription for each chunk
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Output Format</p>
                  <p className="text-xs text-muted-foreground">
                    WAV files at 22050 Hz mono, ready for XTTS training
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chunking Results */}
          {chunkingResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Chunking Results</CardTitle>
                <CardDescription>
                  {chunkingResults.length} dataset(s) created
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {chunkingResults.map((result, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Dataset: {result.datasetId}</span>
                        <span className="text-sm text-muted-foreground">
                          {result.chunks.length} chunks
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {result.chunks.slice(0, 8).map((chunk, i) => (
                          <div
                            key={i}
                            className="p-2 bg-muted rounded text-xs"
                          >
                            <p className="font-mono truncate">{chunk.filename}</p>
                            <p className="text-muted-foreground">
                              {chunk.duration.toFixed(1)}s
                            </p>
                            {chunk.transcription && (
                              <p className="truncate mt-1 text-muted-foreground">
                                {chunk.transcription}
                              </p>
                            )}
                          </div>
                        ))}
                        {result.chunks.length > 8 && (
                          <div className="p-2 bg-muted/50 rounded text-xs flex items-center justify-center text-muted-foreground">
                            +{result.chunks.length - 8} more
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
