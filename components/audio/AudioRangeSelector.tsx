'use client';

import { useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { AudioTimeInput } from './AudioTimeInput';
import { formatDuration } from '@/lib/utils';

interface AudioRangeSelectorProps {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

export function AudioRangeSelector({
  duration,
  start,
  end,
  onChange,
}: AudioRangeSelectorProps) {
  const handleSliderChange = useCallback((values: number[]) => {
    const [newStart, newEnd] = values;
    onChange(newStart, newEnd);
  }, [onChange]);

  const handleStartChange = useCallback((newStart: number) => {
    // Ensure start doesn't exceed end
    if (newStart < end) {
      onChange(newStart, end);
    }
  }, [end, onChange]);

  const handleEndChange = useCallback((newEnd: number) => {
    // Ensure end doesn't go below start
    if (newEnd > start) {
      onChange(start, newEnd);
    }
  }, [start, onChange]);

  const selectedDuration = end - start;

  return (
    <div className="space-y-4">
      {/* Dual range slider */}
      <div className="px-2">
        <Slider
          value={[start, end]}
          min={0}
          max={duration}
          step={0.1}
          onValueChange={handleSliderChange}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0:00</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Time inputs and duration display */}
      <div className="flex items-end gap-4 flex-wrap">
        <AudioTimeInput
          label="Start"
          value={start}
          onChange={handleStartChange}
          min={0}
          max={end - 0.1}
        />
        <AudioTimeInput
          label="End"
          value={end}
          onChange={handleEndChange}
          min={start + 0.1}
          max={duration}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Duration</span>
          <span className="h-9 flex items-center px-3 bg-muted rounded-md font-mono text-sm">
            {formatDuration(selectedDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}
