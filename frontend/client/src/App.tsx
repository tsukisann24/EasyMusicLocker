import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Upload,
  FolderUp,
  Music,
  CheckCircle,
  AlertCircle,
  Trash2,
  Loader2,
  FolderOpen,
  FolderPlus,
  X,
  File as FileIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

// --- 型定義 ---
type UploadMode = 'file' | 'folder';
type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface FileEntry {
  file: File;
  relativePath: string;
}

// --- App コンポーネント ---
const App: React.FC = () => {
  const [mode, setMode] = useState<UploadMode>('file');
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  // フォルダブラウザ関連
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [folderError, setFolderError] = useState<string>('');

  // フォルダ一覧を取得
  const fetchFolders = useCallback(async (): Promise<void> => {
    try {
      const res = await axios.get<{ folders: string[] }>('/api/folders');
      setFolders(res.data.folders);
    } catch (err: unknown) {
      console.error('Failed to fetch folders:', err);
    }
  }, []);

  useEffect(() => {
    void fetchFolders();
  }, [fetchFolders]);

  // ファイル選択ハンドラ
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) {
      const selectedFiles: File[] = Array.from(e.target.files);
      const entries: FileEntry[] = selectedFiles.map((file: File) => {
        // webkitRelativePath はフォルダ選択時にセットされる
        const relativePath: string = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        return { file, relativePath };
      });
      setFileEntries((prev: FileEntry[]) => [...prev, ...entries]);
      setStatus('idle');
      setMessage('');
    }
    // inputをリセットして同じファイルを再選択可能にする
    e.target.value = '';
  };

  // ファイル削除
  const removeFile = (index: number): void => {
    setFileEntries((prev: FileEntry[]) => prev.filter((_: FileEntry, i: number) => i !== index));
  };

  // 全ファイルクリア
  const clearFiles = (): void => {
    setFileEntries([]);
    setStatus('idle');
    setMessage('');
  };

  // 新規フォルダ作成
  const createFolder = async (): Promise<void> => {
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    setFolderError('');

    // 選択中のフォルダがあればその配下に作成
    const folderPath: string = selectedFolder
      ? `${selectedFolder}/${newFolderName.trim()}`
      : newFolderName.trim();

    try {
      await axios.post('/api/folders', { path: folderPath });
      setNewFolderName('');
      await fetchFolders();
      // 作成したフォルダを自動選択
      setSelectedFolder(folderPath);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setFolderError(err.response.data.error as string);
      } else {
        setFolderError('フォルダの作成に失敗しました。');
      }
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // アップロード処理
  const uploadFiles = async (): Promise<void> => {
    if (fileEntries.length === 0) return;

    setStatus('uploading');
    setProgress(0);
    setMessage('');

    const formData: FormData = new FormData();
    fileEntries.forEach((entry: FileEntry) => {
      formData.append('music', entry.file);
    });

    // 相対パス情報をJSON配列としてフォームフィールドに追加
    const relativePaths: string[] = fileEntries.map((entry: FileEntry) => entry.relativePath);
    formData.append('relativePaths', JSON.stringify(relativePaths));

    const queryParams: string = selectedFolder
      ? `?targetFolder=${encodeURIComponent(selectedFolder)}`
      : '';

    try {
      await axios.post(`/upload${queryParams}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (progressEvent.total) {
            const percent: number = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgress(percent);
          }
        },
      });
      setStatus('success');
      setMessage(`${fileEntries.length} 個のファイルをアップロードしました！`);
      setFileEntries([]);
      setProgress(100);
      // フォルダ一覧を更新（新しいサブフォルダが作られた可能性があるため）
      void fetchFolders();
    } catch (error: unknown) {
      console.error(error);
      setStatus('error');
      setMessage('アップロードに失敗しました。');
    }
  };

  return (
    <div className="glass-card">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1>Easy Music Locker</h1>
        <p className="subtitle">あなたの音楽をクラウド（自作）に安全に保存</p>
      </motion.div>

      {/* タブ切り替え */}
      <div className="tab-container">
        <button
          className={`tab-btn ${mode === 'file' ? 'active' : ''}`}
          onClick={() => setMode('file')}
        >
          <FileIcon size={16} />
          ファイル
        </button>
        <button
          className={`tab-btn ${mode === 'folder' ? 'active' : ''}`}
          onClick={() => setMode('folder')}
        >
          <FolderUp size={16} />
          フォルダ
        </button>
      </div>

      {/* アップロード先フォルダ選択 */}
      <div className="folder-section">
        <div className="folder-section-label">アップロード先</div>

        {/* 選択中フォルダのバッジ */}
        {selectedFolder && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="selected-folder-badge"
          >
            <span className="badge-label">保存先</span>
            <span className="badge-path">/{selectedFolder}</span>
            <button
              className="badge-clear"
              onClick={() => setSelectedFolder('')}
              title="ルートに戻す"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}

        <div className="folder-browser">
          {/* ルートフォルダ */}
          <div
            className={`folder-item ${selectedFolder === '' ? 'selected' : ''}`}
            onClick={() => setSelectedFolder('')}
          >
            <FolderOpen size={16} className="folder-icon" />
            <span className="folder-name">/ (ルート)</span>
          </div>
          {folders.length > 0 ? (
            folders.map((folder: string) => {
              const depth: number = folder.split('/').length - 1;
              return (
                <div
                  key={folder}
                  className={`folder-item ${selectedFolder === folder ? 'selected' : ''}`}
                  onClick={() => setSelectedFolder(folder)}
                  style={{ paddingLeft: `${14 + depth * 16}px` }}
                >
                  <FolderOpen size={16} className="folder-icon" />
                  <span className="folder-name">{folder.split('/').pop()}</span>
                  {depth > 0 && (
                    <span className="folder-depth">{folder}</span>
                  )}
                </div>
              );
            })
          ) : null}
        </div>

        {/* 新規フォルダ作成 */}
        <div className="new-folder-row">
          <input
            type="text"
            className="new-folder-input"
            placeholder={selectedFolder ? `${selectedFolder}/新しいフォルダ名` : '新しいフォルダ名'}
            value={newFolderName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setNewFolderName(e.target.value);
              setFolderError('');
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                void createFolder();
              }
            }}
          />
          <button
            className="new-folder-btn"
            onClick={() => void createFolder()}
            disabled={!newFolderName.trim() || isCreatingFolder}
          >
            <FolderPlus size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            作成
          </button>
        </div>
        {folderError && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginTop: 6 }}
          >
            {folderError}
          </motion.p>
        )}
      </div>

      {/* ドロップゾーン */}
      <div>
        <label className={`dropzone ${fileEntries.length > 0 ? 'active' : ''}`}>
          <input
            type="file"
            multiple
            accept="audio/*"
            {...(mode === 'folder'
              ? {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...({ webkitdirectory: 'true', directory: 'true' } as any),
                }
              : {})}
            onChange={onFileChange}
            style={{ display: 'none' }}
            key={mode} // モード切り替え時にinputをリセット
          />
          {mode === 'file' ? (
            <Upload className="dropzone-icon" />
          ) : (
            <FolderUp className="dropzone-icon" />
          )}
          <p>
            {mode === 'file'
              ? '音楽ファイルをクリックして選択'
              : 'フォルダをクリックして選択（中のファイルをすべてアップロード）'}
          </p>
        </label>
      </div>

      {/* ファイルリスト */}
      <div className="file-list">
        <AnimatePresence>
          {fileEntries.map((entry: FileEntry, index: number) => (
            <motion.div
              key={`${entry.relativePath}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="file-item"
            >
              <Music size={16} className="file-icon" />
              <div className="file-info">
                <div className="file-name">{entry.file.name}</div>
                {mode === 'folder' && entry.relativePath !== entry.file.name && (
                  <div className="file-path">{entry.relativePath}</div>
                )}
              </div>
              <button
                className="file-remove"
                onClick={() => removeFile(index)}
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ファイル数 & クリア */}
      {fileEntries.length > 0 && (
        <div className="file-count">
          <span>{fileEntries.length} 個のファイルを選択中</span>
          <button className="clear-all" onClick={clearFiles}>
            すべてクリア
          </button>
        </div>
      )}

      {/* プログレスバー */}
      {status === 'uploading' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="progress-container"
        >
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">{progress}%</div>
        </motion.div>
      )}

      {/* アップロードボタン */}
      <button
        className="upload-btn"
        onClick={() => void uploadFiles()}
        disabled={fileEntries.length === 0 || status === 'uploading'}
      >
        {status === 'uploading' ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="spin" size={20} style={{ marginRight: 8 }} />
            アップロード中...
          </span>
        ) : (
          'アップロードを開始'
        )}
      </button>

      {/* ステータスメッセージ */}
      {status === 'success' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="status success">
          <CheckCircle size={16} />
          {message}
        </motion.div>
      )}

      {status === 'error' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="status error">
          <AlertCircle size={16} />
          {message}
        </motion.div>
      )}
    </div>
  );
};

export default App;
