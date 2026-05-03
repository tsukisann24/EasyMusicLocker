import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import os from 'os';

dotenv.config();

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

const app: express.Application = express();
const port: number = 3000;

// JSONボディのパース
app.use(express.json());

// クライアントの静的ファイルを配信（Docker環境用）
// Dockerfileで /app/client-dist にコピーされる
const clientDist: string = path.join(__dirname, '../client-dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log(`Serving static files from: ${clientDist}`);
}

// 音楽ディレクトリのパス
// Dockerコンテナ内では /music にマウントされることを想定
const musicDir: string = process.env.MUSIC_FOLDER_INTERNAL || '/music';

// CORS設定
app.use(cors());

// 保存先ディレクトリの存在確認
if (!fs.existsSync(musicDir)) {
  fs.mkdirSync(musicDir, { recursive: true });
}

// --- ユーティリティ関数 ---

/**
 * パストラバーサル攻撃を防ぐため、指定パスがmusicDir内に収まるか検証する。
 * 安全な絶対パスを返す。不正な場合はnullを返す。
 */
function resolveSafePath(relativePath: string): string | null {
  const resolved: string = path.resolve(musicDir, relativePath);
  // musicDirの外に出ようとしていないか検証
  if (!resolved.startsWith(path.resolve(musicDir))) {
    return null;
  }
  return resolved;
}

/**
 * ディレクトリ内のサブフォルダを再帰的に取得する。
 */
function getSubFolders(baseDir: string, currentDir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath: string = path.join(currentDir, entry.name);
      const relativePath: string = path.relative(baseDir, fullPath);
      results.push(relativePath);
      results.push(...getSubFolders(baseDir, fullPath));
    }
  }
  return results;
}

// --- API エンドポイント ---

/**
 * GET /api/folders
 * 音楽ディレクトリ内のサブフォルダ一覧を返す
 */
app.get('/api/folders', (_req: Request, res: Response) => {
  const folders: string[] = getSubFolders(musicDir, musicDir);
  folders.sort((a: string, b: string) => a.localeCompare(b));
  res.json({ folders });
});

/**
 * POST /api/folders
 * 新規フォルダを作成する
 * Body: { path: string }
 */
app.post('/api/folders', (req: Request, res: Response) => {
  const folderPath: string | undefined = req.body?.path;

  if (!folderPath || typeof folderPath !== 'string' || folderPath.trim() === '') {
    res.status(400).json({ error: 'フォルダパスが指定されていません。' });
    return;
  }

  const safePath: string | null = resolveSafePath(folderPath.trim());
  if (!safePath) {
    res.status(400).json({ error: '不正なフォルダパスです。' });
    return;
  }

  if (fs.existsSync(safePath)) {
    res.status(409).json({ error: 'フォルダは既に存在します。' });
    return;
  }

  try {
    fs.mkdirSync(safePath, { recursive: true });
    res.status(201).json({ message: 'フォルダを作成しました。', path: folderPath.trim() });
  } catch (err: unknown) {
    console.error('Failed to create folder:', err);
    res.status(500).json({ error: 'フォルダの作成に失敗しました。' });
  }
});

// Multerの設定 — 一時ディレクトリにアップロード後、正しい場所に移動する
const tmpDir: string = path.join(os.tmpdir(), 'music-locker-uploads');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const storage: multer.StorageEngine = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, tmpDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // ユニークなファイル名にして衝突を防ぐ
    const uniqueSuffix: string = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const decodedName: string = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const baseName: string = path.basename(decodedName);
    cb(null, `${uniqueSuffix}-${baseName}`);
  }
});

const upload: multer.Multer = multer({ storage });

/**
 * POST /upload
 * 音楽ファイルをアップロードする。
 * クエリ: targetFolder (オプション) - アップロード先サブフォルダ
 * フォーム: relativePaths (オプション) - JSON配列文字列。各ファイルの相対パス情報
 */
app.post('/upload', upload.array('music'), (req: Request, res: Response) => {
  const uploadedFiles: Express.Multer.File[] = req.files as Express.Multer.File[];
  if (!uploadedFiles || uploadedFiles.length === 0) {
    res.status(400).send('No files uploaded.');
    return;
  }

  const targetFolder: string = (req.query.targetFolder as string) || '';
  // relativePathsはフォームフィールドとして送信されるJSON配列
  let relativePaths: string[] = [];
  if (req.body?.relativePaths) {
    try {
      relativePaths = JSON.parse(req.body.relativePaths as string) as string[];
    } catch {
      // パース失敗時は空配列のまま
    }
  }

  const movedFiles: string[] = [];

  for (let i: number = 0; i < uploadedFiles.length; i++) {
    const file: Express.Multer.File = uploadedFiles[i]!;
    const relPath: string | undefined = relativePaths[i];

    // 最終的な保存先を決定
    let destDir: string = musicDir;
    if (targetFolder) {
      const safeTarget: string | null = resolveSafePath(targetFolder);
      if (!safeTarget) {
        // 不正なパスの場合、tmpファイルを削除してエラーを返す
        cleanupTmpFiles(uploadedFiles);
        res.status(400).json({ error: '不正なアップロード先パスです。' });
        return;
      }
      destDir = safeTarget;
    }

    // 相対パスがあればサブフォルダ構造を維持
    let fileName: string = Buffer.from(file.originalname, 'latin1').toString('utf8');
    fileName = path.basename(fileName);

    if (relPath) {
      const relDir: string = path.dirname(relPath);
      if (relDir && relDir !== '.') {
        const safeSub: string | null = resolveSafePath(
          path.join(targetFolder || '', relDir)
        );
        if (!safeSub) {
          cleanupTmpFiles(uploadedFiles);
          res.status(400).json({ error: '不正な相対パスです。' });
          return;
        }
        destDir = safeSub;
      }
    }

    // 保存先ディレクトリ作成
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // tmpから最終保存先にファイルを移動
    const finalPath: string = path.join(destDir, fileName);
    try {
      fs.renameSync(file.path, finalPath);
      movedFiles.push(fileName);
    } catch {
      // rename が cross-device の場合 copy + delete にフォールバック
      try {
        fs.copyFileSync(file.path, finalPath);
        fs.unlinkSync(file.path);
        movedFiles.push(fileName);
      } catch (copyErr: unknown) {
        console.error('Failed to move file:', copyErr);
      }
    }
  }

  res.status(200).json({
    message: 'Successfully uploaded!',
    files: movedFiles
  });
});

/**
 * アップロード失敗時にtmpファイルをクリーンアップする
 */
function cleanupTmpFiles(files: Express.Multer.File[]): void {
  for (const file of files) {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch {
      // クリーンアップ失敗は無視
    }
  }
}

// SPA用フォールバック（Docker環境用）
// APIルート以外はすべてindex.htmlを返す
if (fs.existsSync(clientDist)) {
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// サーバー起動
app.listen(port, () => {
  console.log(`Upload server listening at http://localhost:${port}`);
  console.log(`Music directory: ${musicDir}`);
});
