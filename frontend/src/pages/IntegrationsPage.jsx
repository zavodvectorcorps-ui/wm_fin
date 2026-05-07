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
  Clock, Calendar, MessageSquare, Bell, Database, ExternalLink, RefreshCw, Upload, FileText,
  Banknote, Link2, Users, Unlink, Cloud, LogOut, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

const ExchangeRateSettings = ({ api }) => {
  const [rateData, setRateData] = useState(null);
  const [manualInput, setManualInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api().get('/exchange-rate').then(r => {
      setRateData(r.data);
      setManualInput(r.data.manual_rate ? String(r.data.manual_rate) : '');
    }).catch(() => {});
  }, [api]);

  const saveManualRate = async () => {
    setSaving(true);
    try {
      const val = manualInput.trim() ? parseFloat(manualInput.replace(',', '.')) : null;
      await api().put('/exchange-rate', { manual_rate: val });
      const res = await api().get('/exchange-rate');
      setRateData(res.data);
      toast.success(val ? `Курс установлен: ${val}` : 'Курс сброшен на автоматический (NBP)');
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="bg-muted/50 rounded-lg p-3 flex-1">
          <p className="text-xs text-muted-foreground">Курс NBP (авто)</p>
          <p className="text-xl font-mono font-bold">{rateData?.nbp_rate || '—'}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 flex-1">
          <p className="text-xs text-muted-foreground">Используется</p>
          <p className="text-xl font-mono font-bold">{rateData?.eur_pln || '—'}</p>
          <Badge variant="outline" className="text-xs mt-1">
            {rateData?.source === 'manual' ? 'Ручной' : 'NBP авто'}
          </Badge>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Ручной курс (оставьте пустым для авто)</Label>
          <Input
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            placeholder="Например: 4.30"
            data-testid="manual-rate-input"
          />
        </div>
        <Button onClick={saveManualRate} disabled={saving} size="sm" data-testid="save-rate-btn">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
};

const GoogleDriveOAuthCard = ({ api }) => {
  const [status, setStatus] = useState(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api().get('/settings/google-oauth/status');
      setStatus(res.data);
    } catch {
      // ignore
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle callback query params (drive_connected=1 or drive_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('drive_connected')) {
      toast.success('Google Drive подключён');
      load();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.has('drive_error')) {
      toast.error('Ошибка подключения Google Drive', {
        description: params.get('drive_error'),
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const saveConfig = async () => {
    if (!clientId.trim() && !clientSecret.trim()) {
      toast.error('Введите Client ID и Client Secret');
      return;
    }
    setSaving(true);
    try {
      await api().put('/settings/google-oauth/config', {
        client_id: clientId.trim() || null,
        client_secret: clientSecret.trim() || null,
      });
      toast.success('OAuth Client сохранён');
      setClientId('');
      setClientSecret('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${process.env.REACT_APP_BACKEND_URL}/api/settings/google-oauth/callback`;
      const res = await api().post('/settings/google-oauth/start', { redirect_uri: redirectUri });
      window.location.href = res.data.authorization_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Не удалось начать OAuth');
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Отключить Google Drive? Автобэкапы перестанут работать, пока не подключите заново.')) return;
    setDisconnecting(true);
    try {
      await api().post('/settings/google-oauth/disconnect');
      toast.success('Google Drive отключён');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка отключения');
    } finally {
      setDisconnecting(false);
    }
  };

  const hasConfig = status?.has_client_config;
  const connected = status?.connected;
  const redirectUri = `${process.env.REACT_APP_BACKEND_URL}/api/settings/google-oauth/callback`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-sky-500" />
          Google Drive (OAuth 2.0)
        </CardTitle>
        <CardDescription>
          Автобэкап БД и файлов в ваш личный Google Drive. С 2022 г. Service Accounts не имеют
          квоты хранилища — используется OAuth-делегирование вместо SA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status badges */}
        <div className="flex gap-2 flex-wrap">
          {hasConfig ? (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              OAuth Client настроен
            </Badge>
          ) : (
            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              <XCircle className="h-3 w-3 mr-1" />
              OAuth Client не задан
            </Badge>
          )}
          {connected ? (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" data-testid="drive-connected-badge">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Подключён: {status?.connected_email || 'ok'}
            </Badge>
          ) : (
            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              <XCircle className="h-3 w-3 mr-1" />
              Не подключён
            </Badge>
          )}
        </div>

        {/* Instructions */}
        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <p className="font-semibold text-foreground">Настройка (однократно):</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Откройте <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Cloud Console → Credentials</a>.</li>
              <li>Включите <strong>Google Drive API</strong> (Library → Google Drive API → Enable).</li>
              <li>OAuth consent screen → External → добавьте email пользователя в <strong>Test users</strong>.</li>
              <li>Create Credentials → OAuth client ID → Web application.</li>
              <li>В <strong>Authorized redirect URIs</strong> добавьте ровно этот URL:
                <div className="mt-1 flex items-center gap-2">
                  <code className="px-2 py-1 bg-muted rounded text-[11px] break-all flex-1">{redirectUri}</code>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { navigator.clipboard.writeText(redirectUri); toast.success('Скопировано'); }}>
                    Copy
                  </Button>
                </div>
              </li>
              <li>Скопируйте <strong>Client ID</strong> и <strong>Client Secret</strong> ниже → «Сохранить» → «Подключить Google Drive».</li>
            </ol>
          </AlertDescription>
        </Alert>

        {/* Client ID / Secret inputs */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>OAuth Client ID {hasConfig && <Badge variant="outline" className="ml-1 text-xs">сохранён</Badge>}</Label>
            <Input
              placeholder={hasConfig ? '••••••• (оставьте пустым чтобы не менять)' : 'xxx.apps.googleusercontent.com'}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              data-testid="drive-client-id"
            />
          </div>
          <div className="space-y-2">
            <Label>OAuth Client Secret {hasConfig && <Badge variant="outline" className="ml-1 text-xs">сохранён</Badge>}</Label>
            <Input
              type="password"
              placeholder={hasConfig ? '••••••• (оставьте пустым чтобы не менять)' : 'GOCSPX-...'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              data-testid="drive-client-secret"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={saveConfig} disabled={saving || (!clientId && !clientSecret)} data-testid="save-drive-config-btn">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
            Сохранить Client ID/Secret
          </Button>

          {!connected && (
            <Button
              variant="default"
              onClick={connect}
              disabled={!hasConfig || connecting}
              data-testid="connect-drive-btn"
            >
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Cloud className="h-4 w-4 mr-2" />}
              Подключить Google Drive
            </Button>
          )}

          {connected && (
            <Button
              variant="destructive"
              onClick={disconnect}
              disabled={disconnecting}
              data-testid="disconnect-drive-btn"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
              Отключить
            </Button>
          )}
        </div>

        {connected && status?.connected_at && (
          <p className="text-xs text-muted-foreground">
            Подключено: {new Date(status.connected_at).toLocaleString('ru-RU')}
            {status.scopes?.length > 0 && (
              <> · Scopes: {status.scopes.filter(s => s.includes('drive')).join(', ')}</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export const IntegrationsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  
  const [settings, setSettings] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_auto_summary: false,
    telegram_summary_schedule: 'weekly',
    telegram_summary_time: '09:00',
    adesk_api_token: ''
  });
  const [hasSavedBotToken, setHasSavedBotToken] = useState(false);
  const [hasSavedAdeskToken, setHasSavedAdeskToken] = useState(false);
  
  const [testStatus, setTestStatus] = useState(null);

  // Webhook state
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [botUsers, setBotUsers] = useState([]);

  // Google Sheets state
  const [gsUrl, setGsUrl] = useState('');
  const [gsServiceAccount, setGsServiceAccount] = useState('');
  const [gsSaving, setGsSaving] = useState(false);
  const [gsTesting, setGsTesting] = useState(false);
  const [gsTestStatus, setGsTestStatus] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, backupRes] = await Promise.all([
        api().get('/settings/integrations'),
        api().get('/backup/status')
      ]);
      setSettings({
        telegram_bot_token: '',
        telegram_chat_id: settingsRes.data.telegram_chat_id || '',
        telegram_auto_summary: settingsRes.data.telegram_auto_summary || false,
        telegram_summary_schedule: settingsRes.data.telegram_summary_schedule || 'weekly',
        telegram_summary_time: settingsRes.data.telegram_summary_time || '09:00',
        adesk_api_token: ''
      });
      setHasSavedBotToken(!!settingsRes.data.has_telegram_bot_token);
      setHasSavedAdeskToken(!!settingsRes.data.has_adesk_api_token);
      setBackupStatus(backupRes.data);
      setGsUrl(backupRes.data.spreadsheet_url || '');
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const fetchWebhookInfo = useCallback(async () => {
    try {
      const [infoRes, usersRes] = await Promise.all([
        api().get('/telegram/webhook-info'),
        api().get('/telegram/bot-users'),
      ]);
      setWebhookInfo(infoRes.data);
      setBotUsers(usersRes.data.users || []);
    } catch {
      // ignore
    }
  }, [api]);

  useEffect(() => {
    if (!loading) fetchWebhookInfo();
  }, [loading, fetchWebhookInfo]);

  const setupWebhook = async () => {
    setWebhookLoading(true);
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const webhookUrl = `${backendUrl}/api/telegram/webhook`;
      const res = await api().post('/telegram/setup-webhook', { webhook_url: webhookUrl });
      if (res.data.status === 'success') {
        toast.success('Вебхук установлен');
        fetchWebhookInfo();
      } else {
        toast.error(res.data.message || 'Ошибка');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка установки вебхука');
    } finally {
      setWebhookLoading(false);
    }
  };

  const removeWebhook = async () => {
    setWebhookLoading(true);
    try {
      await api().delete('/telegram/remove-webhook');
      toast.success('Вебхук удалён');
      fetchWebhookInfo();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка');
    } finally {
      setWebhookLoading(false);
    }
  };

  const runBackupNow = async () => {
    setBackingUp(true);
    try {
      const res = await api().post('/backup/google-sheets');
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Бэкап выполнен');
      } else {
        toast.error(res.data.message || 'Ошибка бэкапа');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка бэкапа');
    } finally {
      setBackingUp(false);
    }
  };

  const saveGoogleSheets = async () => {
    setGsSaving(true);
    try {
      const payload = { google_sheets_url: gsUrl };
      if (gsServiceAccount.trim()) {
        payload.google_service_account = gsServiceAccount.trim();
      }
      await api().put('/settings/integrations/google-sheets', payload);
      toast.success('Настройки Google Sheets сохранены');
      fetchSettings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setGsSaving(false);
    }
  };

  const testGoogleSheets = async () => {
    setGsTesting(true);
    setGsTestStatus(null);
    try {
      const res = await api().post('/backup/google-sheets/test');
      setGsTestStatus(res.data.status);
      if (res.data.status === 'success') {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      setGsTestStatus('error');
      toast.error(error.response?.data?.detail || 'Ошибка тестирования');
    } finally {
      setGsTesting(false);
    }
  };

  const handleSaFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        if (!json.client_email || !json.private_key) {
          toast.error('JSON должен содержать client_email и private_key');
          return;
        }
        setGsServiceAccount(JSON.stringify(json));
        toast.success(`Service Account загружен: ${json.client_email}`);
      } catch {
        toast.error('Некорректный JSON файл');
      }
    };
    reader.readAsText(file);
  };

  const saveTelegramSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        telegram_chat_id: settings.telegram_chat_id,
        telegram_auto_summary: settings.telegram_auto_summary,
        telegram_summary_schedule: settings.telegram_summary_schedule,
        telegram_summary_time: settings.telegram_summary_time,
      };
      if (settings.telegram_bot_token && settings.telegram_bot_token.trim()) {
        payload.telegram_bot_token = settings.telegram_bot_token.trim();
      }
      await api().put('/settings/integrations/telegram', payload);
      toast.success('Настройки сохранены');
      setSettings(s => ({ ...s, telegram_bot_token: '' }));
      fetchSettings();
    } catch (error) {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const testTelegram = async () => {
    if (!hasSavedBotToken && (!settings.telegram_bot_token || !settings.telegram_chat_id)) {
      toast.error('Заполните токен и Chat ID');
      return;
    }

    setTesting(true);
    setTestStatus(null);
    try {
      const res = await api().post('/settings/telegram/test', {
        bot_token: settings.telegram_bot_token || null,
        chat_id: settings.telegram_chat_id || null
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
          {/* Google Sheets Backup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-green-500" />
                Google Sheets Backup
              </CardTitle>
              <CardDescription>
                Автоматический ежедневный бэкап всех данных в Google таблицу
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status badges */}
              <div className="flex gap-2 flex-wrap">
                {backupStatus?.has_service_account ? (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Service Account: {backupStatus.service_account_email}
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    Service Account не загружен
                  </Badge>
                )}
                {backupStatus?.has_url ? (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    URL таблицы указан
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    URL таблицы не указан
                  </Badge>
                )}
              </div>

              {/* Google Sheets URL */}
              <div className="space-y-2">
                <Label>URL Google таблицы</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={gsUrl}
                    onChange={(e) => setGsUrl(e.target.value)}
                    data-testid="gs-url-input"
                  />
                  {gsUrl && (
                    <Button variant="outline" size="icon" asChild>
                      <a href={gsUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Создайте пустую Google таблицу и предоставьте доступ (Редактор) для email Service Account
                </p>
              </div>

              {/* Service Account JSON */}
              <div className="space-y-2">
                <Label>Service Account JSON</Label>
                <div className="flex gap-2 items-start">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg hover:bg-muted/50 transition-colors">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {gsServiceAccount ? 'JSON загружен (нажмите для замены)' : 'Загрузить JSON файл сервисного аккаунта'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleSaFileUpload}
                      data-testid="gs-sa-file-input"
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Создайте Service Account в{' '}
                  <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Google Cloud Console
                  </a>
                  , скачайте JSON-ключ и загрузите сюда
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button onClick={saveGoogleSheets} disabled={gsSaving} data-testid="save-gs-btn">
                  {gsSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
                  Сохранить настройки
                </Button>

                <Button variant="outline" onClick={testGoogleSheets} disabled={gsTesting || !backupStatus?.configured}
                  data-testid="test-gs-btn">
                  {gsTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Тест подключения
                </Button>

                <Button variant="outline" onClick={runBackupNow} disabled={backingUp || !backupStatus?.configured}
                  data-testid="run-backup-btn">
                  {backingUp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Выгрузить сейчас
                </Button>

                {gsTestStatus === 'success' && (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Подключено
                  </Badge>
                )}
                {gsTestStatus === 'error' && (
                  <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    Ошибка подключения
                  </Badge>
                )}
              </div>

              {/* Info */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">Автоматический бэкап</p>
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <Clock className="h-3 w-3 mr-1" />
                    Ежедневно в 02:00
                  </Badge>
                </div>
                {backupStatus?.last_backup_at && (
                  <p className="text-xs text-muted-foreground">
                    Последний бэкап: {new Date(backupStatus.last_backup_at).toLocaleString('ru-RU')}
                  </p>
                )}
                <p className="text-sm font-medium mt-2">Выгружаемые данные:</p>
                <ul className="text-sm text-muted-foreground grid grid-cols-2 gap-1">
                  <li>• Операции</li>
                  <li>• Контрагенты</li>
                  <li>• Счета</li>
                  <li>• Наличные</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Google Drive (OAuth) Backup */}
          <GoogleDriveOAuthCard api={api} />

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
                  <Label htmlFor="bot-token">Bot Token {hasSavedBotToken && <Badge variant="outline" className="ml-2 text-xs">сохранён</Badge>}</Label>
                  <Input
                    id="bot-token"
                    type="password"
                    placeholder={hasSavedBotToken ? '••••••• (оставьте пустым чтобы не менять)' : '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'}
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
                  disabled={sendingSummary || (!hasSavedBotToken && !settings.telegram_bot_token)}
                  data-testid="send-summary-btn"
                >
                  {sendingSummary ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4 mr-2" />
                  )}
                  Отправить сводку сейчас
                </Button>

                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await api().post('/settings/telegram/send-payment-reminders');
                      toast.success(res.data.message);
                    } catch (e) {
                      toast.error(e.response?.data?.detail || 'Ошибка');
                    }
                  }}
                  disabled={!hasSavedBotToken && !settings.telegram_bot_token}
                  data-testid="send-payment-reminders-btn"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Напомнить о платежах
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Exchange Rate */}
          <Card data-testid="exchange-rate-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-500" />
                Курс EUR/PLN
              </CardTitle>
              <CardDescription>
                Автоматический курс от NBP (Национальный банк Польши) с возможностью ручной корректировки
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ExchangeRateSettings api={api} />
            </CardContent>
          </Card>

          {/* Telegram Cash Bot */}
          <Card data-testid="cash-bot-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-500" />
                Telegram Касса
              </CardTitle>
              <CardDescription>
                Записывайте наличные операции прямо из Telegram. Несколько пользователей могут отправлять данные.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Webhook Status */}
              <div className="flex items-center gap-2 flex-wrap">
                {webhookInfo?.webhook_url ? (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Вебхук активен
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    Вебхук не настроен
                  </Badge>
                )}
                {webhookInfo?.pending_update_count > 0 && (
                  <Badge variant="outline">
                    В очереди: {webhookInfo.pending_update_count}
                  </Badge>
                )}
                {webhookInfo?.last_error_message && (
                  <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-xs">
                    {webhookInfo.last_error_message}
                  </Badge>
                )}
              </div>

              {/* Webhook Actions */}
              <div className="flex gap-2">
                {!webhookInfo?.webhook_url ? (
                  <Button onClick={setupWebhook} disabled={webhookLoading || (!hasSavedBotToken && !settings.telegram_bot_token)}
                    data-testid="setup-webhook-btn">
                    {webhookLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                    Подключить Telegram Кассу
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={setupWebhook} disabled={webhookLoading}
                      data-testid="update-webhook-btn">
                      {webhookLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Переподключить
                    </Button>
                    <Button variant="outline" onClick={removeWebhook} disabled={webhookLoading} className="text-rose-500"
                      data-testid="remove-webhook-btn">
                      <Unlink className="h-4 w-4 mr-2" />
                      Отключить
                    </Button>
                  </>
                )}
              </div>

              <Separator />

              {/* Connected Users */}
              {botUsers.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Подключённые пользователи ({botUsers.length})
                  </Label>
                  <div className="space-y-1">
                    {botUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                        <span className="font-medium">{u.telegram_first_name}</span>
                        {u.telegram_username && <span className="text-muted-foreground">@{u.telegram_username}</span>}
                        {u.current_direction_name && (
                          <Badge variant="outline" className="text-xs ml-auto">
                            {u.current_direction_name}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 text-destructive hover:bg-destructive/10 ${u.current_direction_name ? '' : 'ml-auto'}`}
                          onClick={async () => {
                            if (!window.confirm(`Удалить ${u.telegram_first_name} из чат-бота? Они смогут подключиться снова, отправив /start.`)) return;
                            try {
                              await api().delete(`/telegram/bot-users/${u.chat_id}`);
                              toast.success('Пользователь удалён из бота');
                              fetchWebhookInfo();
                            } catch (e) {
                              toast.error(e.response?.data?.detail || 'Ошибка удаления');
                            }
                          }}
                          data-testid={`bot-user-delete-${u.chat_id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Как пользоваться:</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Сохраните Bot Token выше и нажмите "Подключить Telegram Кассу"</li>
                  <li>Отправьте <code className="bg-background px-1 rounded">/start</code> вашему боту</li>
                  <li>Выберите направление (Теплицы, Сауны и т.д.)</li>
                  <li>Отправляйте операции: <code className="bg-background px-1 rounded">1000 Антон зп</code> (расход) или <code className="bg-background px-1 rounded">+5000 продажа</code> (приход)</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-2">
                  Команды: <code className="bg-background px-1 rounded">/direction</code> — сменить направление, <code className="bg-background px-1 rounded">/balance</code> — баланс, <code className="bg-background px-1 rounded">/last</code> — последние операции
                </p>
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
