"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, HardDrive, RefreshCw } from "lucide-react";

interface StorageInfo {
  name: string;
  path: string;
  description: string;
}

export default function SettingsPage() {
  const [storageLocations] = useState<StorageInfo[]>([
    { name: "uploads", path: "/data/xtts/uploads", description: "Загруженные файлы" },
    { name: "datasets", path: "/data/xtts/datasets", description: "Обработанные датасеты" },
    { name: "models", path: "/data/xtts/models", description: "Обученные модели" },
    { name: "speakers", path: "/data/xtts/speakers", description: "Референсные голоса" },
  ]);

  const [apiUrl, setApiUrl] = useState(
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-muted-foreground">
          Управление системой и данными
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* API Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Backend API</CardTitle>
            <CardDescription>
              Настройки подключения к локальному GPU серверу
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Backend URL</Label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:8000"
              />
            </div>
            <Button variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Проверить подключение
            </Button>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle>Хранилище</CardTitle>
            <CardDescription>
              Локальные директории данных
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {storageLocations.map((storage) => (
              <div
                key={storage.name}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{storage.description}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {storage.path}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle>Система</CardTitle>
            <CardDescription>
              Информация о конфигурации
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">XTTS Version</span>
                <span>v2.0.3</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Whisper Model</span>
                <span>large-v3</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Backend</span>
                <span>Local GPU</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Framework</span>
                <span>FastAPI + PyTorch</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Опасная зона</CardTitle>
            <CardDescription>
              Необратимые действия
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Очистить все данные
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
