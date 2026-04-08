import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { 
  Upload, FileText, Image, FileSpreadsheet, File, Download, 
  Eye, Trash2, AlertCircle, CheckCircle2, FolderPlus, Folder, FolderOpen,
  CalendarIcon, ChevronRight, ArrowRight, CheckCheck, X, GripVertical
} from 'lucide-react';
import { formatDate, getDirectionClass } from '../lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/* ──── Month picker via Calendar popover ──── */
const MonthPicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value + '-01') : null;

  const handleSelect = (date) => {
    if (date) {
      onChange(format(date, 'yyyy-MM'));
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="filter-period-btn">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(new Date(value + '-01'), 'LLLL yyyy', { locale: ru }) : 'Выберите период'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          locale={ru}
          data-testid="filter-period-calendar"
        />
        {value && (
          <div className="p-2 pt-0 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { onChange(''); setOpen(false); }}>
              <X className="h-3 w-3 mr-1" /> Сбросить
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/* ──── Folder sidebar item (drop target) ──── */
const FolderItem = ({ folder, isActive, onClick, onDelete, docCount, onDropDoc }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const docId = e.dataTransfer.getData('text/doc-id');
        if (docId) onDropDoc(docId, folder.id);
      }}
      data-testid={`folder-${folder.id}`}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left group cursor-pointer ${
        dragOver
          ? 'bg-primary/20 ring-2 ring-primary/40 scale-[1.02]'
          : isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/60 text-muted-foreground'
      }`}
    >
      {isActive || dragOver ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: folder.color }} /> : <Folder className="h-4 w-4 shrink-0" style={{ color: folder.color }} />}
      <span className="truncate flex-1">{folder.name}</span>
      {docCount > 0 && <Badge variant="secondary" className="text-xs h-5 px-1.5">{docCount}</Badge>}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        data-testid={`delete-folder-${folder.id}`}
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>
    </div>
  );
};

/* ──── "All documents" drop target ──── */
const AllDocsDropTarget = ({ isActive, onClick, count, onDropDoc }) => {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const docId = e.dataTransfer.getData('text/doc-id');
        if (docId) onDropDoc(docId);
      }}
      data-testid="folder-all"
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left cursor-pointer ${
        dragOver
          ? 'bg-primary/20 ring-2 ring-primary/40 scale-[1.02]'
          : isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/60 text-muted-foreground'
      }`}
    >
      <Folder className="h-4 w-4 shrink-0" />
      <span className="flex-1">Все документы</span>
      <Badge variant="secondary" className="text-xs h-5 px-1.5">{count}</Badge>
    </div>
  );
};


export const DocumentsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [folders, setFolders] = useState([]);
  
  const [activeTab, setActiveTab] = useState('all');
  const [activeFolder, setActiveFolder] = useState(null); // null = show all
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [moveDialogDoc, setMoveDialogDoc] = useState(null);
  
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
    folder_id: '',
    description: ''
  });
  
  const [exportPeriod, setExportPeriod] = useState(new Date().toISOString().slice(0, 7));
  
  const fileInputRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.type !== 'all') params.type = filters.type;
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.direction_id !== 'all') params.direction_id = filters.direction_id;
      if (filters.period) params.period = filters.period;
      if (activeFolder) params.folder_id = activeFolder;
      
      const [docsRes, pendingRes, directionsRes, contractorsRes, transRes, foldersRes] = await Promise.all([
        api().get('/documents', { params }),
        api().get('/documents/pending'),
        api().get('/directions'),
        api().get('/contractors'),
        api().get('/transactions', { params: { status: 'fact', per_page: 50 } }),
        api().get('/documents/folders'),
      ]);
      
      setDocuments(docsRes.data);
      setPendingDocs(pendingRes.data);
      setDirections(directionsRes.data);
      setContractors(contractorsRes.data);
      setTransactions(transRes.data.items || transRes.data);
      setFolders(foldersRes.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api, filters, activeFolder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadData(prev => ({ ...prev, file, folder_id: activeFolder || '' }));
      setUploadDialogOpen(true);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadData(prev => ({ ...prev, file, folder_id: activeFolder || '' }));
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
      if (uploadData.folder_id) formData.append('folder_id', uploadData.folder_id);
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
        folder_id: '',
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

  const handleProcess = async (id) => {
    try {
      await api().post(`/documents/${id}/process`);
      toast.success('Документ обработан');
      fetchData();
    } catch (error) {
      toast.error('Ошибка обработки');
    }
  };

  const handleMoveToFolder = async (docId, folderId) => {
    try {
      await api().post(`/documents/${docId}/move`, { folder_id: folderId || null });
      toast.success('Документ перемещён');
      setMoveDialogDoc(null);
      fetchData();
    } catch (error) {
      toast.error('Ошибка перемещения');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api().post('/documents/folders', { name: newFolderName.trim() });
      toast.success('Папка создана');
      setNewFolderDialogOpen(false);
      setNewFolderName('');
      fetchData();
    } catch (error) {
      toast.error('Ошибка создания папки');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await api().delete(`/documents/folders/${folderId}`);
      toast.success('Папка удалена');
      if (activeFolder === folderId) setActiveFolder(null);
      fetchData();
    } catch (error) {
      toast.error('Ошибка удаления папки');
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

  // Count docs per folder
  const folderDocCounts = {};
  documents.forEach(d => {
    if (d.folder_id) {
      folderDocCounts[d.folder_id] = (folderDocCounts[d.folder_id] || 0) + 1;
    }
  });

  const displayedDocs = activeTab === 'pending' ? pendingDocs : documents;
  const activeFolderObj = folders.find(f => f.id === activeFolder);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="documents-title">Документы</h1>
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

      <div className="flex gap-6">
        {/* Folder Sidebar */}
        <div className="w-56 shrink-0 space-y-2 hidden md:block" data-testid="folder-sidebar">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Папки</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewFolderDialogOpen(true)} data-testid="create-folder-btn">
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
          
          <AllDocsDropTarget
            isActive={!activeFolder}
            onClick={() => setActiveFolder(null)}
            count={documents.length}
            onDropDoc={(docId) => handleMoveToFolder(docId, null)}
          />

          {folders.map(f => (
            <FolderItem
              key={f.id}
              folder={f}
              isActive={activeFolder === f.id}
              onClick={() => setActiveFolder(f.id)}
              onDelete={handleDeleteFolder}
              docCount={folderDocCounts[f.id] || 0}
              onDropDoc={handleMoveToFolder}
            />
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Breadcrumb */}
          {activeFolder && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="folder-breadcrumb">
              <button onClick={() => setActiveFolder(null)} className="hover:text-foreground transition-colors">Все документы</button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{activeFolderObj?.name}</span>
            </div>
          )}

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
                      <SelectItem value="processed">Обработан</SelectItem>
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

                  <MonthPicker
                    value={filters.period}
                    onChange={(v) => setFilters({ ...filters, period: v })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Drop Zone */}
          <div 
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
                    {activeTab === 'pending' ? 'Нет документов, требующих обработки' : activeFolder ? 'В этой папке нет документов' : 'Нет документов'}
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
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedDocs.map((doc) => {
                      const FileIcon = getFileIcon(doc.mime_type, doc.file_name);
                      const docFolder = folders.find(f => f.id === doc.folder_id);
                      return (
                        <TableRow
                          key={doc.id}
                          className="table-row-hover cursor-grab active:cursor-grabbing"
                          data-testid={`doc-row-${doc.id}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/doc-id', doc.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.currentTarget.style.opacity = '0.4';
                          }}
                          onDragEnd={(e) => {
                            e.currentTarget.style.opacity = '1';
                          }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                              <FileIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium truncate max-w-48">{doc.file_name}</p>
                            <div className="flex items-center gap-1.5">
                              {doc.description && (
                                <p className="text-sm text-muted-foreground truncate max-w-36">{doc.description}</p>
                              )}
                              {docFolder && (
                                <Badge variant="outline" className="text-xs h-5 px-1.5" style={{ borderColor: docFolder.color, color: docFolder.color }}>
                                  <Folder className="h-3 w-3 mr-0.5" />{docFolder.name}
                                </Badge>
                              )}
                            </div>
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
                            ) : doc.status === 'processed' ? (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                <CheckCheck className="h-3 w-3 mr-1" />
                                Обработан
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
                              {doc.status === 'pending' && (
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  title="Обработать"
                                  onClick={() => handleProcess(doc.id)}
                                  data-testid={`process-doc-${doc.id}`}
                                >
                                  <CheckCheck className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                title="Переместить в папку"
                                onClick={() => setMoveDialogDoc(doc)}
                                data-testid={`move-doc-${doc.id}`}
                              >
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                title="Просмотр"
                                onClick={() => setPreviewDocument(doc)}
                                data-testid={`preview-doc-${doc.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                title="Удалить"
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
        </div>
      </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Направление</Label>
                <Select value={uploadData.direction_id} onValueChange={(v) => setUploadData({ ...uploadData, direction_id: v })}>
                  <SelectTrigger data-testid="upload-direction">
                    <SelectValue placeholder="Выберите" />
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
                <Label>Папка</Label>
                <Select value={uploadData.folder_id} onValueChange={(v) => setUploadData({ ...uploadData, folder_id: v })}>
                  <SelectTrigger data-testid="upload-folder">
                    <SelectValue placeholder="Без папки" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без папки</SelectItem>
                    {folders.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Привязать к операции (необязательно)</Label>
              <Select value={uploadData.transaction_id} onValueChange={(v) => setUploadData({ ...uploadData, transaction_id: v })}>
                <SelectTrigger data-testid="upload-transaction">
                  <SelectValue placeholder="Не привязывать" />
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

      {/* Move to Folder Dialog */}
      <Dialog open={!!moveDialogDoc} onOpenChange={() => setMoveDialogDoc(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Переместить в папку</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <button
              onClick={() => handleMoveToFolder(moveDialogDoc?.id, null)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:bg-muted/60 transition-colors text-left"
              data-testid="move-to-root"
            >
              <Folder className="h-4 w-4" />
              <span>Без папки</span>
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => handleMoveToFolder(moveDialogDoc?.id, f.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:bg-muted/60 transition-colors text-left ${
                  moveDialogDoc?.folder_id === f.id ? 'bg-primary/10 text-primary' : ''
                }`}
                data-testid={`move-to-folder-${f.id}`}
              >
                <Folder className="h-4 w-4" style={{ color: f.color }} />
                <span>{f.name}</span>
                {moveDialogDoc?.folder_id === f.id && <Badge variant="secondary" className="text-xs ml-auto">Текущая</Badge>}
              </button>
            ))}
          </div>
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

      {/* Create Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Новая папка</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Название</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Например: Выписки EUR"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              data-testid="new-folder-name-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleCreateFolder} data-testid="create-folder-submit">Создать</Button>
          </DialogFooter>
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
              <MonthPicker value={exportPeriod} onChange={setExportPeriod} />
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
