'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AudioTimeInputProps {
  label: string;
  value: number; // seconds
  onChange: (value: number) => void;
  max?: number;
  min?: number;
  className?: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseTime(timeStr: string): number | null {
  const parts = timeStr.split(':').map(Number);

  if (parts.some(isNaN)) return null;

  if (parts.length === 2) {
    // mm:ss
    const [m, s] = parts;
    if (m < 0 || s < 0 || s >= 60) return null;
    return m * 60 + s;
  } else if (parts.length === 3) {
    // hh:mm:ss
    const [h, m, s] = parts;
    if (h < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }

  return null;
}

export function AudioTimeInput({
  label,
  value,
  onChange,
  max = Infinity,
  min = 0,
  className = '',
}: AudioTimeInputProps) {
  const [inputValue, setInputValue] = useState(formatTime(value));
  const [isValid, setIsValid] = useState(true);

  // Update input when value prop changes
  useEffect(() => {
    setInputValue(formatTime(value));
    setIsValid(true);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    const parsed = parseTime(newValue);
    if (parsed !== null && parsed >= min && parsed <= max) {
      setIsValid(true);
      onChange(parsed);
    } else {
      setIsValid(false);
    }
  }, [onChange, min, max]);

  const handleBlur = useCallback(() => {
    // Reset to valid value on blur if invalid
    if (!isValid) {
      setInputValue(formatTime(value));
      setIsValid(true);
    }
  }, [isValid, value]);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={`time-${label}`} className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id={`time-${label}`}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="00:00"
        className={`w-24 font-mono text-center ${!isValid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      />
    </div>
  );
}
