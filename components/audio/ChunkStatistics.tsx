'use client';

import { Button } from '@/components/ui/button';
import { BarChart3, Clock, Layers } from 'lucide-react';
import { ChunkingPreview } from '@/lib/types';

interface ChunkStatisticsProps {
  preview: ChunkingPreview | null;
  isLoading: boolean;
  onAnalyze: () => void;
  disabled?: boolean;
}

export function ChunkStatistics({
  preview,
  isLoading,
  onAnalyze,
  disabled = false,
}: ChunkStatisticsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Preview
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onAnalyze}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
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
              Analyzing...
            </>
          ) : (
            'Analyze Chunks'
          )}
        </Button>
      </div>

      {preview ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Layers className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{preview.totalChunks}</div>
            <div className="text-xs text-muted-foreground">Total Chunks</div>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold">{preview.avgDuration.toFixed(1)}s</div>
            <div className="text-xs text-muted-foreground">Avg Duration</div>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold">{preview.minDuration.toFixed(1)}s</div>
            <div className="text-xs text-muted-foreground">Min Duration</div>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <div className="text-2xl font-bold">{preview.maxDuration.toFixed(1)}s</div>
            <div className="text-xs text-muted-foreground">Max Duration</div>
          </div>
        </div>
      ) : (
        <div className="bg-muted/20 rounded-lg p-6 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Click "Analyze Chunks" to preview the chunking results</p>
        </div>
      )}
    </div>
  );
}
