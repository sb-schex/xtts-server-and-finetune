'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { VADConfig } from '@/lib/types';

interface VADSettingsPanelProps {
  settings: VADConfig;
  onChange: (settings: VADConfig) => void;
  disabled?: boolean;
}

const PRESETS: Record<string, VADConfig> = {
  conservative: {
    minChunkDuration: 8,
    targetChunkDuration: 12,
    maxChunkDuration: 18,
    minSilenceDuration: 0.7,
    silenceThreshold: 0.4,
  },
  balanced: {
    minChunkDuration: 6,
    targetChunkDuration: 10,
    maxChunkDuration: 15,
    minSilenceDuration: 0.5,
    silenceThreshold: 0.5,
  },
  aggressive: {
    minChunkDuration: 4,
    targetChunkDuration: 8,
    maxChunkDuration: 12,
    minSilenceDuration: 0.3,
    silenceThreshold: 0.6,
  },
};

export function VADSettingsPanel({
  settings,
  onChange,
  disabled = false,
}: VADSettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePreset = useCallback((preset: keyof typeof PRESETS) => {
    onChange(PRESETS[preset]);
  }, [onChange]);

  const updateSetting = useCallback(<K extends keyof VADConfig>(
    key: K,
    value: VADConfig[K]
  ) => {
    onChange({ ...settings, [key]: value });
  }, [settings, onChange]);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">VAD Settings (Advanced)</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-6">
          {/* Presets */}
          <div className="space-y-2">
            <Label>Presets</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreset('conservative')}
                disabled={disabled}
              >
                Conservative
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreset('balanced')}
                disabled={disabled}
              >
                Balanced
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreset('aggressive')}
                disabled={disabled}
              >
                Aggressive
              </Button>
            </div>
          </div>

          {/* Chunk Duration Settings */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Min Duration</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.minChunkDuration}s
                </span>
              </div>
              <Slider
                value={[settings.minChunkDuration]}
                min={2}
                max={12}
                step={1}
                onValueChange={([v]) => updateSetting('minChunkDuration', v)}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Target Duration</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.targetChunkDuration}s
                </span>
              </div>
              <Slider
                value={[settings.targetChunkDuration]}
                min={4}
                max={20}
                step={1}
                onValueChange={([v]) => updateSetting('targetChunkDuration', v)}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Max Duration</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.maxChunkDuration}s
                </span>
              </div>
              <Slider
                value={[settings.maxChunkDuration]}
                min={8}
                max={30}
                step={1}
                onValueChange={([v]) => updateSetting('maxChunkDuration', v)}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Silence Detection Settings */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Min Silence Duration</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.minSilenceDuration.toFixed(1)}s
                </span>
              </div>
              <Slider
                value={[settings.minSilenceDuration]}
                min={0.1}
                max={1.5}
                step={0.1}
                onValueChange={([v]) => updateSetting('minSilenceDuration', v)}
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Minimum pause length to consider as a split point
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Silence Threshold</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.silenceThreshold.toFixed(1)}
                </span>
              </div>
              <Slider
                value={[settings.silenceThreshold]}
                min={0.1}
                max={0.9}
                step={0.1}
                onValueChange={([v]) => updateSetting('silenceThreshold', v)}
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Higher = more sensitive to speech detection
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
