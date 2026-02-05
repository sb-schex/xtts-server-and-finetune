// Authentication
export interface User {
  username: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
}

// Data Processing
export interface AudioFile {
  id: string;
  filename: string;
  size: number;
  duration?: number;
  uploadedAt: string;
}

export interface ProcessingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  result?: DatasetInfo;
}

export interface DatasetInfo {
  name: string;
  audioFiles: number;
  totalDuration: number;
  transcriptions: TranscriptionEntry[];
}

export interface TranscriptionEntry {
  audio: string;
  text: string;
  duration: number;
}

// Training
export interface TrainingConfig {
  datasetPath: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  gradAccumSteps: number;
  maxAudioLength: number;
}

export interface TrainingJob {
  id: string;
  status: 'pending' | 'training' | 'completed' | 'failed';
  epoch: number;
  totalEpochs: number;
  step: number;
  loss: number;
  metrics: TrainingMetric[];
}

export interface TrainingMetric {
  epoch: number;
  step: number;
  loss: number;
  timestamp: string;
}

// Inference
export interface InferenceConfig {
  text: string;
  speakerWav: string;
  language: string;
  temperature: number;
  lengthPenalty: number;
  repetitionPenalty: number;
  topK: number;
  topP: number;
  speed: number;
}

export interface GeneratedAudio {
  id: string;
  audioUrl: string;
  duration: number;
  createdAt: string;
}

// Volumes
export interface VolumeFile {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// SSE Event types
export type SSEEventType =
  | 'progress'
  | 'completed'
  | 'error'
  | 'metric';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

// Long Audio Processing / VAD Chunking
export interface AudioRange {
  start: number;  // seconds
  end: number;
}

export interface VADConfig {
  minChunkDuration: number;     // default: 6
  targetChunkDuration: number;  // default: 10
  maxChunkDuration: number;     // default: 15
  minSilenceDuration: number;   // default: 0.5
  silenceThreshold: number;     // default: 0.5
}

export interface ChunkInfo {
  id: string;
  index: number;
  start: number;
  end: number;
  duration: number;
}

export interface ChunkingPreview {
  chunks: ChunkInfo[];
  totalChunks: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface ChunkingResult {
  datasetId: string;
  chunks: Array<{
    filename: string;
    duration: number;
    transcription?: string;
  }>;
}

export interface ChunkingJob {
  id: string;
  status: 'pending' | 'analyzing' | 'chunking' | 'transcribing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  currentChunk?: number;
  totalChunks?: number;
  result?: ChunkingResult;
}
