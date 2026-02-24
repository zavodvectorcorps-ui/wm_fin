import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Progress } from '../components/ui/progress';
import { 
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react';
import { formatCurrency, getDirectionClass } from '../lib/utils';
import { toast } from 'sonner';

const POLISH_BANKS = [
  { id: 'mbank', name: 'mBank' },
  { id: 'pko', name: 'PKO BP' },
  { id: 'santander', name: 'Santander PL' },
  { id: 'ing', name: 'ING Polska' },
  { id: 'alior', name: 'Alior Bank' },
  { id: 'other', name: 'Другой банк' },
];

export const ImportPage = () => {
  const { api } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [bank, setBank] = useState('');
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({
    date_column: '',
    amount_column: '',
    description_column: '',
    type_column: ''
  });
  const [accounts, setAccounts] = useState([]);
  const [directions, setDirections] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedDirection, setSelectedDirection] = useState('');
  const [importResult, setImportResult] = useState(null);

  const fetchSettings = useCallback(async () => {
    try {
      const [accountsRes, directionsRes] = await Promise.all([
        api().get('/accounts'),
        api().get('/directions')
      ]);
      setAccounts(accountsRes.data);
      setDirections(directionsRes.data);
      if (accountsRes.data.length > 0) setSelectedAccount(accountsRes.data[0].id);
      if (directionsRes.data.length > 0) setSelectedDirection(directionsRes.data[0].id);
    } catch (error) {
      toast.error('Ошибка загрузки настроек');
    }
  }, [api]);

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
      toast.error('Поддерживаются только CSV и XLSX файлы');
      return;
    }
    
    setFile(selectedFile);
    setLoading(true);
    
    try {
      await fetchSettings();
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const res = await api().post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setPreview(res.data);
      
      // Auto-map columns based on common names
      const columns = res.data.columns;
      const autoMapping = {
        date_column: columns.find(c => /date|дата|data/i.test(c)) || '',
        amount_column: columns.find(c => /amount|kwota|сумма|suma/i.test(c)) || '',
        description_column: columns.find(c => /desc|opis|описание|title|tytuł/i.test(c)) || '',
        type_column: columns.find(c => /type|typ|тип/i.test(c)) || ''
      };
      setMapping(autoMapping);
      
      setStep(2);
    } catch (error) {
      toast.error('Ошибка чтения файла');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!mapping.date_column || !mapping.amount_column || !mapping.description_column) {
      toast.error('Укажите обязательные колонки');
      return;
    }
    
    if (!selectedAccount || !selectedDirection) {
      toast.error('Выберите счёт и направление');
      return;
    }
    
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const params = new URLSearchParams({
        date_column: mapping.date_column,
        amount_column: mapping.amount_column,
        description_column: mapping.description_column,
        account_id: selectedAccount,
        direction_id: selectedDirection,
        ...(mapping.type_column && { type_column: mapping.type_column })
      });
      
      const res = await api().post(`/import/process?${params.toString()}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImportResult(res.data);
      setStep(3);
      toast.success(`Импортировано ${res.data.imported_count} операций`);
    } catch (error) {
      toast.error('Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const resetImport = () => {
    setStep(1);
    setFile(null);
    setBank('');
    setPreview(null);
    setMapping({ date_column: '', amount_column: '', description_column: '', type_column: '' });
    setImportResult(null);
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Импорт выписок</h1>
        <p className="text-muted-foreground">Загрузка банковских операций из CSV/XLSX</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 ${step >= s ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
              </div>
              <span className="hidden sm:inline">
                {s === 1 && 'Загрузка файла'}
                {s === 2 && 'Настройка'}
                {s === 3 && 'Результат'}
              </span>
            </div>
            {s < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: File Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Загрузите файл выписки</CardTitle>
            <CardDescription>Поддерживаются форматы CSV и XLSX</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Банк</Label>
              <Select value={bank} onValueChange={setBank}>
                <SelectTrigger data-testid="bank-select">
                  <SelectValue placeholder="Выберите банк" />
                </SelectTrigger>
                <SelectContent>
                  {POLISH_BANKS.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div 
              className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) {
                  const input = document.getElementById('file-input');
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(droppedFile);
                  input.files = dataTransfer.files;
                  handleFileSelect({ target: { files: [droppedFile] } });
                }
              }}
              data-testid="file-dropzone"
            >
              <input 
                id="file-input"
                type="file" 
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">
                Перетащите файл или нажмите для выбора
              </p>
              <p className="text-sm text-muted-foreground">
                CSV или XLSX до 10MB
              </p>
            </div>
            
            {loading && (
              <div className="space-y-2">
                <Progress value={50} />
                <p className="text-sm text-muted-foreground text-center">Загрузка файла...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && preview && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Настройка маппинга</CardTitle>
              <CardDescription>Укажите соответствие колонок</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Дата *</Label>
                <Select value={mapping.date_column} onValueChange={(v) => setMapping({ ...mapping, date_column: v })}>
                  <SelectTrigger data-testid="map-date">
                    <SelectValue placeholder="Выберите колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.columns.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Сумма *</Label>
                <Select value={mapping.amount_column} onValueChange={(v) => setMapping({ ...mapping, amount_column: v })}>
                  <SelectTrigger data-testid="map-amount">
                    <SelectValue placeholder="Выберите колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.columns.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Описание *</Label>
                <Select value={mapping.description_column} onValueChange={(v) => setMapping({ ...mapping, description_column: v })}>
                  <SelectTrigger data-testid="map-description">
                    <SelectValue placeholder="Выберите колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.columns.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Тип (опционально)</Label>
                <Select value={mapping.type_column} onValueChange={(v) => setMapping({ ...mapping, type_column: v })}>
                  <SelectTrigger data-testid="map-type">
                    <SelectValue placeholder="Выберите колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Не использовать</SelectItem>
                    {preview.columns.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="h-px bg-border my-4" />
              
              <div className="space-y-2">
                <Label>Счёт для импорта *</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger data-testid="import-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Направление по умолчанию *</Label>
                <Select value={selectedDirection} onValueChange={setSelectedDirection}>
                  <SelectTrigger data-testid="import-direction">
                    <SelectValue placeholder="Выберите направление" />
                  </SelectTrigger>
                  <SelectContent>
                    {directions.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={resetImport} className="flex-1">Отмена</Button>
                <Button onClick={handleImport} disabled={loading} className="flex-1" data-testid="start-import-btn">
                  {loading ? 'Импорт...' : 'Импортировать'}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Предпросмотр</CardTitle>
              <CardDescription>
                {preview.total_rows} операций найдено, показаны первые {Math.min(preview.preview.length, 10)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.columns.slice(0, 5).map(c => (
                        <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        {preview.columns.slice(0, 5).map(c => (
                          <TableCell key={c} className="whitespace-nowrap truncate max-w-48">
                            {String(row[c] || '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              Импорт завершён
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-2xl font-bold text-emerald-500">{importResult.imported_count}</p>
                <p className="text-sm text-muted-foreground">Импортировано</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-2xl font-bold text-yellow-500">{importResult.duplicate_count}</p>
                <p className="text-sm text-muted-foreground">Дубликатов</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{importResult.imported?.filter(i => i.matched).length || 0}</p>
                <p className="text-sm text-muted-foreground">Автоматизировано</p>
              </div>
            </div>
            
            {importResult.imported?.length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Импортированные операции</h4>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Сумма</TableHead>
                        <TableHead>Описание</TableHead>
                        <TableHead>Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.imported.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{item.date}</TableCell>
                          <TableCell>
                            <Badge variant={item.type === 'income' ? 'default' : 'destructive'}>
                              {item.type === 'income' ? 'Приход' : 'Расход'}
                            </Badge>
                          </TableCell>
                          <TableCell className={`font-mono ${item.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {formatCurrency(item.amount)}
                          </TableCell>
                          <TableCell className="truncate max-w-48">{item.description}</TableCell>
                          <TableCell>
                            {item.matched ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500">
                                Распознано
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
                                Требует проверки
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetImport}>Импортировать ещё</Button>
              <Button onClick={() => window.location.href = '/transactions'}>Перейти к операциям</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImportPage;
