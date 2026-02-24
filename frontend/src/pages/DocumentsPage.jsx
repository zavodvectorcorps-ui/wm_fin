import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Upload, FileText, Image, FileSpreadsheet, File, Download, 
  Paperclip, Eye, Trash2, Search, Filter, AlertCircle, CheckCircle2
} from 'lucide-react';
import { formatDate, getDirectionClass } from '../lib/utils';
import { toast } from 'sonner';

const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Инвойс' },
  { value: 'bank_statement', label: 'Банковская выписка' },
  { value: 'payment_order', label: 'Платёжное поручение' },
  { value: 'act', label: 'Акт' },
  { value: 'contract', label: 'Договор' },
  { value: 'receipt', label: 'Чек' },
  { value: 'other', label: 'Прочее' },
];

const getTypeLabel = (type) => DOCUMENT_TYPES.find(t => t.value === type)?.label || type;

const getFileIcon = (mimeType, fileName) => {
  if (mimeType?.includes('pdf') || fileName?.endsWith('.pdf')) return FileText;
  if (mimeType?.includes('image') || /\.(jpg|jpeg|png)$/i.test(fileName)) return Image;
  if (mimeType?.includes('spreadsheet') || /\.(xlsx|xls)$/i.test(fileName)) return FileSpreadsheet;
  return File;
};

export const DocumentsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  const [activeTab, setActiveTab] = useState('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    direction_id: 'all',
    period: ''
  });
  
  const [uploadData, setUploadData] = useState({
    file: null,
    document_date: new Date().toISOString().split('T')[0],
    type: 'other',
    direction_id: '',
    contractor_id: '',
    transaction_id: '',
    description: ''
  });
  
  const [exportPeriod, setExportPeriod] = useState(new Date().toISOString().slice(0, 7));
  
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.type !== 'all') params.type = filters.type;
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.direction_id !== 'all') params.direction_id = filters.direction_id;
      if (filters.period) params.period = filters.period;
      
      const [docsRes, pendingRes, directionsRes, contractorsRes, transRes] = await Promise.all([
        api().get('/documents', { params }),
        api().get('/documents/pending'),
        api().get('/directions'),
        api().get('/contractors'),
        api().get('/transactions', { params: { status: 'fact' } })
      ]);
      
      setDocuments(docsRes.data);
      setPendingDocs(pendingRes.data);
      setDirections(directionsRes.data);
      setContractors(contractorsRes.data);
      setTransactions(transRes.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadData({ ...uploadData, file });
      setUploadDialogOpen(true);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadData({ ...uploadData, file });
      setUploadDialogOpen(true);
    }
  };

  const handleUpload = async () => {
    if (!uploadData.file) {
      toast.error('Выберите файл');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('document_date', uploadData.document_date);
      formData.append('type', uploadData.type);
      if (uploadData.direction_id) formData.append('direction_id', uploadData.direction_id);
      if (uploadData.contractor_id) formData.append('contractor_id', uploadData.contractor_id);
      if (uploadData.transaction_id) formData.append('transaction_id', uploadData.transaction_id);
      if (uploadData.description) formData.append('description', uploadData.description);

      await api().post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Документ загружен');
      setUploadDialogOpen(false);
      setUploadData({
        file: null,
        document_date: new Date().toISOString().split('T')[0],
        type: 'other',
        direction_id: '',
        contractor_id: '',
        transaction_id: '',
        description: ''
      });
      fetchData();
    } catch (error) {
      toast.error('Ошибка загрузки');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api().delete(`/documents/${id}`);
      toast.success('Документ удалён');
      fetchData();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const handleExport = async () => {
    try {
      const response = await api().get(`/documents/export?period=${exportPeriod}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `documents_${exportPeriod}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Архив скачан');
      setExportDialogOpen(false);
    } catch (error) {
      toast.error('Ошибка экспорта');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const displayedDocs = activeTab === 'pending' ? pendingDocs : documents;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Документы</h1>
          <p className="text-muted-foreground">Управление файлами и документами</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportDialogOpen(true)} data-testid="export-docs-btn">
            <Download className="h-4 w-4 mr-2" />
            Экспорт
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} data-testid="upload-doc-btn">
            <Upload className="h-4 w-4 mr-2" />
            Загрузить
          </Button>
          <input 
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all-docs">
            Все документы
            <Badge variant="secondary" className="ml-2">{documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending-docs">
            <AlertCircle className="h-4 w-4 mr-1 text-yellow-500" />
            Требуют обработки
            <Badge variant="destructive" className="ml-2">{pendingDocs.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      {activeTab === 'all' && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
                <SelectTrigger data-testid="filter-type">
                  <SelectValue placeholder="Тип документа" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  {DOCUMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger data-testid="filter-status">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="linked">Привязан</SelectItem>
                  <SelectItem value="pending">Не привязан</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.direction_id} onValueChange={(v) => setFilters({ ...filters, direction_id: v })}>
                <SelectTrigger data-testid="filter-direction">
                  <SelectValue placeholder="Направление" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все направления</SelectItem>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input 
                type="month"
                placeholder="Период"
                value={filters.period}
                onChange={(e) => setFilters({ ...filters, period: e.target.value })}
                data-testid="filter-period"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drop Zone */}
      <div 
        ref={dropZoneRef}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        data-testid="drop-zone"
      >
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">
          Перетащите файлы сюда или нажмите для выбора
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, PNG, JPG, XLSX до 10MB
        </p>
      </div>

      {/* Documents List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : displayedDocs.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {activeTab === 'pending' ? 'Нет документов, требующих обработки' : 'Нет документов'}
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Загрузить документ
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Направление</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedDocs.map((doc) => {
                  const FileIcon = getFileIcon(doc.mime_type, doc.file_name);
                  return (
                    <TableRow key={doc.id} className="table-row-hover" data-testid={`doc-row-${doc.id}`}>
                      <TableCell>
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium truncate max-w-48">{doc.file_name}</p>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground truncate max-w-48">{doc.description}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getTypeLabel(doc.type)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {doc.document_date ? formatDate(doc.document_date) : '-'}
                      </TableCell>
                      <TableCell>
                        {doc.direction_name ? (
                          <Badge variant="outline" className={getDirectionClass(doc.direction_name)}>
                            {doc.direction_name}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {doc.status === 'linked' ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Привязан
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Не привязан
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatFileSize(doc.file_size)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setPreviewDocument(doc)}
                            data-testid={`preview-doc-${doc.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDelete(doc.id)}
                            data-testid={`delete-doc-${doc.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Загрузка документа</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {uploadData.file && (
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{uploadData.file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(uploadData.file.size)}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Дата документа</Label>
                <Input 
                  type="date"
                  value={uploadData.document_date}
                  onChange={(e) => setUploadData({ ...uploadData, document_date: e.target.value })}
                  data-testid="upload-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Тип документа</Label>
                <Select value={uploadData.type} onValueChange={(v) => setUploadData({ ...uploadData, type: v })}>
                  <SelectTrigger data-testid="upload-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Направление</Label>
              <Select value={uploadData.direction_id} onValueChange={(v) => setUploadData({ ...uploadData, direction_id: v })}>
                <SelectTrigger data-testid="upload-direction">
                  <SelectValue placeholder="Выберите направление" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указано</SelectItem>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Привязать к операции</Label>
              <Select value={uploadData.transaction_id} onValueChange={(v) => setUploadData({ ...uploadData, transaction_id: v })}>
                <SelectTrigger data-testid="upload-transaction">
                  <SelectValue placeholder="Выберите операцию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не привязывать</SelectItem>
                  {transactions.slice(0, 50).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.date} - {t.category_name || 'Без категории'} - {t.amount} {t.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea 
                placeholder="Описание документа..."
                value={uploadData.description}
                onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                data-testid="upload-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleUpload} data-testid="upload-submit-btn">Загрузить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewDocument?.file_name}</DialogTitle>
          </DialogHeader>
          
          {previewDocument && (
            <div className="flex-1 overflow-hidden">
              {previewDocument.mime_type?.includes('image') || /\.(jpg|jpeg|png)$/i.test(previewDocument.file_name) ? (
                <img 
                  src={`${process.env.REACT_APP_BACKEND_URL}${previewDocument.file_url}`}
                  alt={previewDocument.file_name}
                  className="max-w-full max-h-[60vh] mx-auto object-contain"
                />
              ) : previewDocument.mime_type?.includes('pdf') || previewDocument.file_name?.endsWith('.pdf') ? (
                <iframe
                  src={`${process.env.REACT_APP_BACKEND_URL}${previewDocument.file_url}`}
                  className="w-full h-[60vh]"
                  title={previewDocument.file_name}
                />
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Предпросмотр недоступен</p>
                  <Button asChild>
                    <a href={`${process.env.REACT_APP_BACKEND_URL}${previewDocument.file_url}`} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Скачать файл
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Экспорт документов</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Период</Label>
              <Input 
                type="month"
                value={exportPeriod}
                onChange={(e) => setExportPeriod(e.target.value)}
                data-testid="export-period"
              />
            </div>
            
            <p className="text-sm text-muted-foreground">
              Будет создан ZIP-архив со структурой папок: /расходы/, /доходы/, /выписки/, /договоры/
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleExport} data-testid="export-submit-btn">
              <Download className="h-4 w-4 mr-2" />
              Скачать архив
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentsPage;
