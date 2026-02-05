'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scissors, FileAudio, Check, AlertCircle, X } from 'lucide-react';
import { AudioWaveform } from './AudioWaveform';
import { AudioRangeSelector } from './AudioRangeSelector';
import { AudioPlayer } from './AudioPlayer';
import { VADSettingsPanel } from './VADSettingsPanel';
import { ChunkStatistics } from './ChunkStatistics';
import {
  AudioRange,
  VADConfig,
  ChunkingPreview,
  ChunkingJob,
} from '@/lib/types';

interface LongAudioProcessorProps {
  audioId: string;
  audioPath: string;
  audioUrl: string;
  filename: string;
  onComplete?: (result: ChunkingJob['result']) => void;
  onCancel?: () => void;
}

type ProcessingState = 'idle' | 'loading' | 'ready' | 'analyzing' | 'processing' | 'completed' | 'error';

const DEFAULT_VAD_CONFIG: VADConfig = {
  minChunkDuration: 6,
  targetChunkDuration: 10,
  maxChunkDuration: 15,
  minSilenceDuration: 0.5,
  silenceThreshold: 0.5,
};

const LANGUAGES = [
  { value: 'ru', label: 'Russian' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'pl', label: 'Polish' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

export function LongAudioProcessor({
  audioId,
  audioPath,
  audioUrl,
  filename,
  onComplete,
  onCancel,
}: LongAudioProcessorProps) {
  // State
  const [state, setState] = useState<ProcessingState>('loading');
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<AudioRange>({ start: 0, end: 0 });
  const [vadConfig, setVadConfig] = useState<VADConfig>(DEFAULT_VAD_CONFIG);
  const [preview, setPreview] = useState<ChunkingPreview | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [language, setLanguage] = useState('ru');

  // Job progress state
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChunkingJob['result'] | null>(null);

  // Handle waveform ready
  const handleWaveformReady = useCallback((dur: number) => {
    setDuration(dur);
    setRange({ start: 0, end: dur });
    setState('ready');
  }, []);

  // Handle range change from waveform region
  const handleRegionUpdate = useCallback((start: number, end: number) => {
    setRange({ start, end });
    setPreview(null); // Reset preview when range changes
  }, []);

  // Handle range change from selector
  const handleRangeChange = useCallback((start: number, end: number) => {
    setRange({ start, end });
    setPreview(null);
  }, []);

  // Analyze chunks (preview)
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/data/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioId,
          audioPath,
          range,
          vadConfig,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPreview(data.preview);
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [audioId, audioPath, range, vadConfig]);

  // Start chunking
  const handleStartChunking = useCallback(async () => {
    setState('processing');
    setProgress(0);
    setProgressMessage('Starting...');
    setError(null);

    try {
      const response = await fetch('/api/data/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioId,
          audioPath,
          range,
          vadConfig,
          autoTranscribe,
          language,
        }),
      });

      const data = await response.json();

      if (data.success && data.jobId) {
        setJobId(data.jobId);
      } else {
        throw new Error(data.error || 'Failed to start chunking');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start chunking');
      setState('error');
    }
  }, [audioId, audioPath, range, vadConfig, autoTranscribe, language]);

  // Subscribe to job progress
  useEffect(() => {
    if (!jobId) return;

    const eventSource = new EventSource(`/api/data/chunk/progress/${jobId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
        if (data.message) {
          setProgressMessage(data.message);
        }
        if (data.status === 'completed' && data.result) {
          setResult(data.result);
          setState('completed');
          eventSource.close();
        }
        if (data.status === 'failed') {
          setError(data.error || 'Chunking failed');
          setState('error');
          eventSource.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.addEventListener('complete', () => {
      eventSource.close();
    });

    eventSource.onerror = () => {
      // Try to reconnect once
      setTimeout(() => {
        if (state === 'processing') {
          // Check job status via API
          fetch(`/api/data/chunk/progress/${jobId}`)
            .then(res => res.json())
            .then(data => {
              if (data.status === 'completed') {
                setResult(data.result);
                setState('completed');
              } else if (data.status === 'failed') {
                setError(data.error || 'Chunking failed');
                setState('error');
              }
            })
            .catch(() => {
              setError('Connection lost');
              setState('error');
            });
        }
      }, 1000);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, state]);

  // Notify parent on completion
  useEffect(() => {
    if (state === 'completed' && result) {
      onComplete?.(result);
    }
  }, [state, result, onComplete]);

  const isProcessing = state === 'analyzing' || state === 'processing';
  const canProcess = state === 'ready' && range.end - range.start > 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scissors className="h-5 w-5" />
            Audio Trimmer
          </CardTitle>
          {onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileAudio className="h-4 w-4" />
          <span className="truncate">{filename}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Completed state */}
        {state === 'completed' && result && (
          <div className="flex items-center gap-2 p-4 bg-green-500/10 text-green-600 rounded-lg">
            <Check className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-medium">Chunking completed!</div>
              <div className="text-sm opacity-80">
                Created {result.chunks.length} chunks in dataset "{result.datasetId}"
              </div>
            </div>
          </div>
        )}

        {/* Waveform visualization */}
        {state !== 'completed' && (
          <>
            <div className="space-y-2">
              <AudioWaveform
                audioUrl={audioUrl}
                onReady={handleWaveformReady}
                onRegionUpdate={handleRegionUpdate}
                regionStart={range.start}
                regionEnd={range.end}
              />
            </div>

            {/* Range selector */}
            {state === 'ready' && (
              <>
                <AudioRangeSelector
                  duration={duration}
                  start={range.start}
                  end={range.end}
                  onChange={handleRangeChange}
                />

                {/* Audio player for selected range */}
                <AudioPlayer
                  audioUrl={audioUrl}
                  startTime={range.start}
                  endTime={range.end}
                />

                {/* VAD Settings */}
                <VADSettingsPanel
                  settings={vadConfig}
                  onChange={setVadConfig}
                  disabled={isProcessing}
                />

                {/* Chunk preview/statistics */}
                <ChunkStatistics
                  preview={preview}
                  isLoading={isAnalyzing}
                  onAnalyze={handleAnalyze}
                  disabled={isProcessing}
                />

                {/* Transcription options */}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="auto-transcribe"
                      checked={autoTranscribe}
                      onCheckedChange={(checked) => setAutoTranscribe(checked === true)}
                      disabled={isProcessing}
                    />
                    <Label htmlFor="auto-transcribe" className="cursor-pointer">
                      Auto-transcribe (Whisper)
                    </Label>
                  </div>

                  {autoTranscribe && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="language">Language:</Label>
                      <Select
                        value={language}
                        onValueChange={setLanguage}
                        disabled={isProcessing}
                      >
                        <SelectTrigger id="language" className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Processing progress */}
            {state === 'processing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{progressMessage}</span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Action button */}
            {state === 'ready' && (
              <Button
                onClick={handleStartChunking}
                disabled={!canProcess || isProcessing}
                className="w-full"
                size="lg"
              >
                <Scissors className="h-4 w-4 mr-2" />
                Split into Chunks
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
