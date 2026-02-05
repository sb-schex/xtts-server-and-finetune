"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Pause,
  Upload,
  Volume2,
  Download,
  Loader2,
  AlertCircle,
  Mic,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";

interface Speaker {
  name: string;
  path: string;
  filename: string;
  size?: number;
}

interface Model {
  name: string;
  path: string;
}

interface GeneratedAudio {
  id: string;
  audioUrl: string;
  duration: number;
  text: string;
}

export default function InferencePage() {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [uploadingSpeaker, setUploadingSpeaker] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  const [config, setConfig] = useState({
    speakerWav: "",
    modelPath: "",
    language: "ru",
    temperature: 0.7,
    lengthPenalty: 1.0,
    repetitionPenalty: 2.0,
    topK: 50,
    topP: 0.85,
    speed: 1.0,
  });

  // Load speakers and models on mount
  useEffect(() => {
    fetch("/api/inference/speakers")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSpeakers(data.data);
        }
      })
      .catch(console.error);

    fetch("/api/training/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setModels(data.data);
        }
      })
      .catch(console.error);
  }, []);

  const handleSpeakerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSpeaker(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/inference/speakers/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setSpeakers((prev) => [...prev, data.speaker]);
        setConfig((prev) => ({ ...prev, speakerWav: data.speaker.path }));
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Failed to upload speaker");
    } finally {
      setUploadingSpeaker(false);
    }
  };

  const generate = async () => {
    if (!text.trim()) {
      setError("Please enter text to generate");
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedAudio(null);

    try {
      const response = await fetch("/api/inference/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...config,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedAudio(data.data);
      } else {
        throw new Error(data.error || "Generation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioEnd = () => {
    setPlaying(false);
    setCurrentTime(0);
  };

  const downloadAudio = () => {
    if (generatedAudio) {
      const a = document.createElement("a");
      a.href = generatedAudio.audioUrl;
      a.download = `generated_${generatedAudio.id}.wav`;
      a.click();
    }
  };

  const progressPercent = generatedAudio && audioRef.current
    ? (currentTime / (audioRef.current.duration || 1)) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Генерация речи</h1>
        <p className="text-muted-foreground">
          Синтезируйте речь с помощью обученной модели XTTS v2
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Text Input */}
        <Card>
          <CardHeader>
            <CardTitle>Текст для синтеза</CardTitle>
            <CardDescription>Введите текст для генерации речи</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст здесь..."
              className="w-full h-40 p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-ring bg-background"
              disabled={generating}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Голос (Speaker WAV)</Label>
                <Select
                  value={config.speakerWav}
                  onValueChange={(v) => setConfig({ ...config, speakerWav: v })}
                  disabled={generating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите голос" />
                  </SelectTrigger>
                  <SelectContent>
                    {speakers.map((s) => (
                      <SelectItem key={s.path} value={s.path}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="block">
                  <input
                    type="file"
                    className="hidden"
                    accept="audio/*"
                    onChange={handleSpeakerUpload}
                    disabled={uploadingSpeaker || generating}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                    disabled={uploadingSpeaker}
                  >
                    <span>
                      {uploadingSpeaker ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Загрузить голос
                    </span>
                  </Button>
                </label>
              </div>

              <div className="space-y-2">
                <Label>Язык</Label>
                <Select
                  value={config.language}
                  onValueChange={(v) => setConfig({ ...config, language: v })}
                  disabled={generating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">Русский</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="pl">Polski</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {models.length > 0 && (
              <div className="space-y-2">
                <Label>Модель (опционально)</Label>
                <Select
                  value={config.modelPath || "__default__"}
                  onValueChange={(v) => setConfig({ ...config, modelPath: v === "__default__" ? "" : v })}
                  disabled={generating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Базовая модель XTTS v2" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Базовая XTTS v2</SelectItem>
                    {models.map((m) => (
                      <SelectItem key={m.path} value={m.path}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              className="w-full"
              onClick={generate}
              disabled={!text.trim() || generating}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Сгенерировать
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Параметры генерации</CardTitle>
            <CardDescription>Настройте параметры синтеза речи</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Temperature</Label>
                <span className="text-sm text-muted-foreground">
                  {config.temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[config.temperature]}
                onValueChange={([v]) => setConfig({ ...config, temperature: v })}
                min={0.1}
                max={1.0}
                step={0.05}
                disabled={generating}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Length Penalty</Label>
                <span className="text-sm text-muted-foreground">
                  {config.lengthPenalty.toFixed(1)}
                </span>
              </div>
              <Slider
                value={[config.lengthPenalty]}
                onValueChange={([v]) => setConfig({ ...config, lengthPenalty: v })}
                min={0.5}
                max={2.0}
                step={0.1}
                disabled={generating}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Repetition Penalty</Label>
                <span className="text-sm text-muted-foreground">
                  {config.repetitionPenalty.toFixed(1)}
                </span>
              </div>
              <Slider
                value={[config.repetitionPenalty]}
                onValueChange={([v]) => setConfig({ ...config, repetitionPenalty: v })}
                min={1.0}
                max={10.0}
                step={0.5}
                disabled={generating}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Top K</Label>
                <span className="text-sm text-muted-foreground">{config.topK}</span>
              </div>
              <Slider
                value={[config.topK]}
                onValueChange={([v]) => setConfig({ ...config, topK: v })}
                min={1}
                max={100}
                step={1}
                disabled={generating}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Top P</Label>
                <span className="text-sm text-muted-foreground">
                  {config.topP.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[config.topP]}
                onValueChange={([v]) => setConfig({ ...config, topP: v })}
                min={0.1}
                max={1.0}
                step={0.05}
                disabled={generating}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Скорость</Label>
                <span className="text-sm text-muted-foreground">
                  {config.speed.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[config.speed]}
                onValueChange={([v]) => setConfig({ ...config, speed: v })}
                min={0.5}
                max={2.0}
                step={0.1}
                disabled={generating}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audio Player */}
      <Card>
        <CardHeader>
          <CardTitle>Результат</CardTitle>
          <CardDescription>
            {generatedAudio
              ? `Длительность: ${generatedAudio.duration.toFixed(1)} сек`
              : "Сгенерируйте речь для прослушивания"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {generatedAudio ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={togglePlay}>
                  {playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <div className="flex-1 h-12 bg-muted rounded-lg flex items-center px-4">
                  <Volume2 className="h-4 w-4 text-muted-foreground mr-2" />
                  <div className="flex-1 h-1 bg-primary/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="ml-3 text-xs text-muted-foreground">
                    {currentTime.toFixed(1)}s
                  </span>
                </div>
                <Button variant="outline" size="icon" onClick={downloadAudio}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <audio
                ref={audioRef}
                src={generatedAudio.audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleAudioEnd}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
              />

              {generatedAudio.text && (
                <p className="text-sm text-muted-foreground italic">
                  "{generatedAudio.text}..."
                </p>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              {generating ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Генерация аудио...
                </div>
              ) : (
                "Введите текст и нажмите Сгенерировать"
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
