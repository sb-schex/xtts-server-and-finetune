import type {
  ApiResponse,
  ProcessingJob,
  TrainingJob,
  TrainingConfig,
  InferenceConfig,
  VolumeFile,
  GeneratedAudio,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed' };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Auth API
export const authApi = {
  login: async (username: string, password: string) =>
    fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: async () =>
    fetchApi('/api/auth/logout', { method: 'POST' }),

  check: async () =>
    fetchApi('/api/auth/check'),
};

// Data Processing API
export const dataApi = {
  upload: async (files: FileList) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));

    return fetch(`${API_BASE}/api/data/upload`, {
      method: 'POST',
      body: formData,
    }).then((res) => res.json());
  },

  process: async (audioIds: string[], language: string = 'ru') =>
    fetchApi<{ jobId: string }>('/api/data/process', {
      method: 'POST',
      body: JSON.stringify({ audioIds, language }),
    }),

  getProgress: (jobId: string) =>
    new EventSource(`${API_BASE}/api/data/progress/${jobId}`),

  getDatasets: async () =>
    fetchApi<VolumeFile[]>('/api/data/datasets'),
};

// Training API
export const trainingApi = {
  start: async (config: TrainingConfig) =>
    fetchApi<{ jobId: string }>('/api/training/start', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getProgress: (jobId: string) =>
    new EventSource(`${API_BASE}/api/training/progress/${jobId}`),

  stop: async (jobId: string) =>
    fetchApi('/api/training/stop', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    }),

  getModels: async () =>
    fetchApi<VolumeFile[]>('/api/training/models'),
};

// Inference API
export const inferenceApi = {
  generate: async (config: InferenceConfig) =>
    fetchApi<GeneratedAudio>('/api/inference/generate', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getSpeakers: async () =>
    fetchApi<VolumeFile[]>('/api/inference/speakers'),

  uploadSpeaker: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return fetch(`${API_BASE}/api/inference/speakers/upload`, {
      method: 'POST',
      body: formData,
    }).then((res) => res.json());
  },
};

// Volumes API
export const volumesApi = {
  list: async (path: string = '/') =>
    fetchApi<VolumeFile[]>(`/api/volumes/list?path=${encodeURIComponent(path)}`),

  delete: async (path: string) =>
    fetchApi('/api/volumes/delete', {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    }),
};

// SSE Helper
export function subscribeToSSE<T>(
  eventSource: EventSource,
  onMessage: (data: T) => void,
  onError?: (error: Event) => void,
  onComplete?: () => void
): () => void {
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as T;
      onMessage(data);
    } catch (e) {
      console.error('Failed to parse SSE data:', e);
    }
  };

  eventSource.addEventListener('complete', () => {
    eventSource.close();
    onComplete?.();
  });

  eventSource.onerror = (error) => {
    onError?.(error);
    eventSource.close();
  };

  return () => eventSource.close();
}
