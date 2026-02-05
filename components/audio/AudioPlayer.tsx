'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Square, Volume2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

interface AudioPlayerProps {
  audioUrl: string;
  startTime?: number;
  endTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
  className?: string;
}

export function AudioPlayer({
  audioUrl,
  startTime = 0,
  endTime,
  onTimeUpdate,
  className = '',
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [duration, setDuration] = useState(0);

  const effectiveEndTime = endTime ?? duration;
  const effectiveDuration = effectiveEndTime - startTime;

  // Handle audio loaded
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.currentTime = startTime;
      setCurrentTime(startTime);
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);

      // Stop at end time
      if (endTime && time >= endTime) {
        audio.pause();
        audio.currentTime = startTime;
        setIsPlaying(false);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      audio.currentTime = startTime;
      setCurrentTime(startTime);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl, startTime, endTime, onTimeUpdate]);

  // Reset position when start/end changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.currentTime < startTime || audio.currentTime > effectiveEndTime) {
      audio.currentTime = startTime;
      setCurrentTime(startTime);
    }
  }, [startTime, effectiveEndTime]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      // Start from beginning of range if at end
      if (endTime && audio.currentTime >= endTime) {
        audio.currentTime = startTime;
      }
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, startTime, endTime]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = startTime;
    setIsPlaying(false);
    setCurrentTime(startTime);
  }, [startTime]);

  const handleSeek = useCallback((values: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const seekTime = startTime + values[0];
    audio.currentTime = seekTime;
    setCurrentTime(seekTime);
  }, [startTime]);

  const relativeTime = currentTime - startTime;
  const progress = effectiveDuration > 0 ? (relativeTime / effectiveDuration) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <Button
        variant="outline"
        size="icon"
        onClick={togglePlay}
        className="h-10 w-10 shrink-0"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={stop}
        className="h-10 w-10 shrink-0"
      >
        <Square className="h-4 w-4" />
      </Button>

      <div className="flex-1 flex items-center gap-3 h-10 px-4 bg-muted/50 rounded-lg">
        <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Slider
          value={[relativeTime]}
          min={0}
          max={effectiveDuration}
          step={0.1}
          onValueChange={handleSeek}
          className="flex-1"
        />
        <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
          {formatDuration(relativeTime)} / {formatDuration(effectiveDuration)}
        </span>
      </div>
    </div>
  );
}
