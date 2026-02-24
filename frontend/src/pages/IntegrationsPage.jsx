import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Separator } from '../components/ui/separator';
import { 
  Send, CheckCircle2, XCircle, Loader2, Bot, Plug, Settings, 
  Clock, Calendar, MessageSquare, Bell
} from 'lucide-react';
import { toast } from 'sonner';

export const IntegrationsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingSummary, setSendingSummary] = useState(false);
  
  const [settings, setSettings] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_auto_summary: false,
    telegram_summary_schedule: 'weekly',
    telegram_summary_time: '09:00',
    adesk_api_token: ''
  });
  
  const [testStatus, setTestStatus] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api().get('/settings/integrations');
      setSettings({
        telegram_bot_token: res.data.telegram_bot_token || '',
        telegram_chat_id: res.data.telegram_chat_id || '',
        telegram_auto_summary: res.data.telegram_auto_summary || false,
        telegram_summary_schedule: res.data.telegram_summary_schedule || 'weekly',
        telegram_summary_time: res.data.telegram_summary_time || '09:00',
        adesk_api_token: res.data.adesk_api_token || ''
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveTelegramSettings = async () => {
    setSaving(true);
    try {
      await api().put('/settings/integrations/telegram', {
        telegram_bot_token: settings.telegram_bot_token,
        telegram_chat_id: settings.telegram_chat_id,
        telegram_auto_summary: settings.telegram_auto_summary,
        telegram_summary_schedule: settings.telegram_summary_schedule,
        telegram_summary_time: settings.telegram_summary_time
      });
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const testTelegram = async () => {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
      toast.error('Заполните токен и Chat ID');
      return;
    }
    
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await api().post('/settings/telegram/test', {
        bot_token: settings.telegram_bot_token,
        chat_id: settings.telegram_chat_id
      });
      
      setTestStatus(res.data.status);
      if (res.data.status === 'success') {
        toast.success('Тестовое сообщение отправлено');
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      setTestStatus('error');
      toast.error('Ошибка тестирования');
    } finally {
      setTesting(false);
    }
  };

  const sendSummaryNow = async () => {
    setSendingSummary(true);
    try {
      const res = await api().post('/settings/telegram/send-summary?period=week');
      toast.success(res.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка отправки');
    } finally {
      setSendingSummary(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Интеграции</h1>
        <p className="text-muted-foreground">Настройка подключений к внешним сервисам</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* Telegram Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                Telegram Bot
              </CardTitle>
              <CardDescription>
                Получайте финансовые сводки прямо в Telegram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Connection Settings */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bot-token">Bot Token</Label>
                  <Input
                    id="bot-token"
                    type="password"
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    value={settings.telegram_bot_token}
                    onChange={(e) => setSettings({...settings, telegram_bot_token: e.target.value})}
                    data-testid="telegram-bot-token"
                  />
                  <p className="text-xs text-muted-foreground">
                    Получите у @BotFather в Telegram
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="chat-id">Chat ID</Label>
                  <Input
                    id="chat-id"
                    placeholder="-1001234567890"
                    value={settings.telegram_chat_id}
                    onChange={(e) => setSettings({...settings, telegram_chat_id: e.target.value})}
                    data-testid="telegram-chat-id"
                  />
                  <p className="text-xs text-muted-foreground">
                    Получите у @userinfobot или @getidsbot
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={testTelegram} 
                  disabled={testing}
                  data-testid="test-telegram-btn"
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Тест подключения
                </Button>
                
                {testStatus === 'success' && (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Подключено
                  </Badge>
                )}
                {testStatus === 'error' && (
                  <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    Ошибка
                  </Badge>
                )}
              </div>

              <Separator />

              {/* Auto Summary Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Автоматические сводки</Label>
                    <p className="text-sm text-muted-foreground">
                      Получать финансовые сводки автоматически
                    </p>
                  </div>
                  <Switch
                    checked={settings.telegram_auto_summary}
                    onCheckedChange={(v) => setSettings({...settings, telegram_auto_summary: v})}
                    data-testid="auto-summary-switch"
                  />
                </div>

                {settings.telegram_auto_summary && (
                  <div className="grid gap-4 md:grid-cols-2 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label>Расписание</Label>
                      <Select 
                        value={settings.telegram_summary_schedule} 
                        onValueChange={(v) => setSettings({...settings, telegram_summary_schedule: v})}
                      >
                        <SelectTrigger data-testid="schedule-select">
                          <Calendar className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Ежедневно</SelectItem>
                          <SelectItem value="weekly">Еженедельно (воскресенье)</SelectItem>
                          <SelectItem value="monday">По понедельникам</SelectItem>
                          <SelectItem value="friday">По пятницам</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Время отправки</Label>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type="time"
                          value={settings.telegram_summary_time}
                          onChange={(e) => setSettings({...settings, telegram_summary_time: e.target.value})}
                          className="w-32"
                          data-testid="time-input"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button onClick={saveTelegramSettings} disabled={saving} data-testid="save-telegram-btn">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
                  Сохранить настройки
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={sendSummaryNow} 
                  disabled={sendingSummary || !settings.telegram_bot_token}
                  data-testid="send-summary-btn"
                >
                  {sendingSummary ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4 mr-2" />
                  )}
                  Отправить сводку сейчас
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notifications Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-yellow-500" />
                Уведомления
              </CardTitle>
              <CardDescription>
                Системные уведомления о важных событиях
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="bg-muted/50">
                <AlertDescription>
                  <p className="mb-2">Уведомления отправляются автоматически при:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Просроченных плановых платежах</li>
                    <li>Низком балансе на счёте (менее 1000 zł)</li>
                    <li>Некатегоризированных импортированных операциях</li>
                    <li>Документах, ожидающих обработки</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Другие интеграции</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a 
                href="/settings/adesk" 
                className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Plug className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Миграция из Adesk</p>
                  <p className="text-sm text-muted-foreground">Импорт данных через API</p>
                </div>
              </a>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default IntegrationsPage;
