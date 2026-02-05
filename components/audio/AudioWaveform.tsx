'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions';

interface AudioWaveformProps {
  audioUrl: string;
  onReady?: (duration: number) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onRegionUpdate?: (start: number, end: number) => void;
  regionStart?: number;
  regionEnd?: number;
  isPlaying?: boolean;
  onPlayPause?: (playing: boolean) => void;
}

export function AudioWaveform({
  audioUrl,
  onReady,
  onTimeUpdate,
  onRegionUpdate,
  regionStart = 0,
  regionEnd,
  isPlaying = false,
  onPlayPause,
}: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const regionRef = useRef<Region | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'hsl(var(--muted-foreground))',
      progressColor: 'hsl(var(--primary))',
      cursorColor: 'hsl(var(--primary))',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
      plugins: [regions],
    });

    wavesurferRef.current = ws;

    ws.on('ready', () => {
      setIsLoading(false);
      const dur = ws.getDuration();
      setDuration(dur);
      onReady?.(dur);

      // Create initial region
      const end = regionEnd ?? dur;
      const region = regions.addRegion({
        start: regionStart,
        end: end,
        color: 'hsla(var(--primary), 0.2)',
        drag: true,
        resize: true,
      });
      regionRef.current = region;
    });

    ws.on('timeupdate', (time) => {
      onTimeUpdate?.(time);
    });

    ws.on('play', () => {
      onPlayPause?.(true);
    });

    ws.on('pause', () => {
      onPlayPause?.(false);
    });

    // Handle region updates
    regions.on('region-updated', (region) => {
      onRegionUpdate?.(region.start, region.end);
    });

    ws.load(audioUrl);

    return () => {
      ws.destroy();
    };
  }, [audioUrl]);

  // Sync play state
  useEffect(() => {
    if (!wavesurferRef.current || isLoading) return;

    if (isPlaying && !wavesurferRef.current.isPlaying()) {
      wavesurferRef.current.play();
    } else if (!isPlaying && wavesurferRef.current.isPlaying()) {
      wavesurferRef.current.pause();
    }
  }, [isPlaying, isLoading]);

  // Update region when props change
  useEffect(() => {
    if (!regionRef.current || isLoading) return;

    const end = regionEnd ?? duration;
    if (regionRef.current.start !== regionStart || regionRef.current.end !== end) {
      regionRef.current.setOptions({
        start: regionStart,
        end: end,
      });
    }
  }, [regionStart, regionEnd, duration, isLoading]);

  // Seek to position
  const seekTo = useCallback((time: number) => {
    if (!wavesurferRef.current || isLoading) return;
    const progress = time / duration;
    wavesurferRef.current.seekTo(Math.max(0, Math.min(1, progress)));
  }, [duration, isLoading]);

  // Play from region start
  const playRegion = useCallback(() => {
    if (!wavesurferRef.current || !regionRef.current || isLoading) return;
    wavesurferRef.current.setTime(regionRef.current.start);
    wavesurferRef.current.play();
  }, [isLoading]);

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg z-10">
          <div className="flex items-center gap-2 text-muted-foreground">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading waveform...</span>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full min-h-[80px] bg-muted/30 rounded-lg cursor-pointer"
      />
    </div>
  );
}
