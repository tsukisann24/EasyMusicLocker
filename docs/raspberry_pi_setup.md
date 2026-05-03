# 🍓 EasyMusicLocker ラズパイデプロイガイド

## 前提条件

| 項目 | 推奨 |
|---|---|
| Raspberry Pi | Pi 4 (2GB以上) または Pi 5 |
| OS | Raspberry Pi OS (64-bit) Lite 推奨 |
| ストレージ | microSD 32GB以上 (外付けSSD/HDD推奨) |
| ネットワーク | 有線LAN推奨 |

> [!IMPORTANT]
> **Raspberry Pi OS は 64-bit 版を使用してください。** Navidrome の Docker イメージは `arm64` をサポートしていますが、32-bit (armhf) では動作しない可能性があります。

---

## Step 1: Raspberry Pi OS のセットアップ

### 1.1 OS の書き込み
1. PC で **Raspberry Pi Imager** をダウンロード
2. 「Raspberry Pi OS (64-bit) Lite」を選択
3. ⚙️ 設定画面で以下を事前設定:
   - **ホスト名**: `musiclocker` (任意)
   - **SSH を有効化**: ✅
   - **ユーザー名/パスワード**: 設定する
   - **Wi-Fi**: 必要なら設定（有線LAN推奨）
4. microSD に書き込み → ラズパイに挿して起動

### 1.2 SSH 接続
```bash
ssh <ユーザー名>@musiclocker.local
# または
ssh <ユーザー名>@<ラズパイのIPアドレス>
```

### 1.3 システム更新
```bash
sudo apt update && sudo apt upgrade -y
```

---

## Step 2: Docker & Docker Compose のインストール

### 2.1 Docker インストール
```bash
# 公式のインストールスクリプトを使用
curl -fsSL https://get.docker.com | sudo sh

# 現在のユーザーを docker グループに追加（sudo なしで実行可能にする）
sudo usermod -aG docker $USER

# グループ変更を反映（再ログインでもOK）
newgrp docker
```

### 2.2 動作確認
```bash
docker --version
docker compose version
```

> [!NOTE]
> 最近の Docker には `docker compose`（V2）が同梱されています。`docker-compose`（ハイフン付き）は不要です。

---

## Step 3: 音楽ファイルの保存先を準備

### 方法A: 外付けHDD/SSD を使う場合（推奨）
```bash
# 外付けドライブのデバイスを確認
lsblk

# マウントポイントを作成
sudo mkdir -p /mnt/music

# マウント（例: /dev/sda1 が対象のパーティション）
sudo mount /dev/sda1 /mnt/music

# 永続マウント設定
echo '/dev/sda1 /mnt/music ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

> [!WARNING]
> `nofail` オプションを必ず付けてください。ドライブが接続されていない場合でもラズパイが起動できるようになります。

### 方法B: microSD / 内蔵ストレージを使う場合
```bash
mkdir -p ~/music
```

---

## Step 4: プロジェクトの取得

### 4.1 Git のインストール（未インストールの場合）
```bash
sudo apt install -y git
```

### 4.2 リポジトリのクローン
```bash
cd ~
git clone <あなたのリポジトリURL> EasyMusicLocker
cd EasyMusicLocker
```

---

## Step 5: `.env` ファイルの作成

> [!CAUTION]
> 現在の `.env` は WSL 向けのパス（`/mnt/c/MusicLibrary`）になっています。ラズパイ用に必ず書き換えてください。

```bash
nano .env
```

以下の内容に書き換え：

```env
# 音楽ファイルの保存先（Step 3 で準備したパス）
MUSIC_FOLDER=/mnt/music
# Navidrome の内部データ保存先
DATA_FOLDER=./backend/data
# Navidrome のポート番号
NAVIDROME_PORT=4533
```

| 変数 | 説明 | 例 |
|---|---|---|
| `MUSIC_FOLDER` | 音楽ファイルのルートディレクトリ | `/mnt/music` または `~/music` |
| `DATA_FOLDER` | Navidrome の DB・設定データ | `./backend/data` (そのままでOK) |
| `NAVIDROME_PORT` | Navidrome のホスト側ポート | `4533` (標準ポートに戻すのがおすすめ) |

---

## Step 6: compose.yaml の調整

### 6.1 `user` の設定を有効化

ラズパイでは Rancher Desktop ではなく通常の Docker を使うため、`user` を有効化します：

```yaml
services:
  navidrome:
    container_name: navidrome
    image: deluan/navidrome:latest
    restart: unless-stopped
    user: 1000:1000  # ← コメントアウトを解除
    ports:
      - "0.0.0.0:${NAVIDROME_PORT}:4533"
    # ... 以下同じ
```

> [!TIP]
> ラズパイのユーザー UID/GID を確認するには `id` コマンドを実行してください。出力の `uid=1000(pi) gid=1000(pi)` の数値を使います。

### 6.2 フォルダのパーミッション設定
```bash
# data フォルダの作成と権限設定
mkdir -p backend/data
sudo chown -R 1000:1000 backend/data

# 音楽フォルダの権限確認
sudo chown -R 1000:1000 /mnt/music
```

---

## Step 7: ビルド & 起動 🚀

```bash
cd ~/EasyMusicLocker

# イメージのビルドとコンテナの起動
docker compose up -d --build
```

> [!NOTE]
> **初回ビルドにはかなり時間がかかります**（ラズパイ4で10〜20分程度）。Node.js の依存関係のインストールとフロントエンドのビルドが行われるためです。気長に待ちましょう。

### 7.1 起動確認
```bash
# コンテナの状態を確認
docker compose ps

# ログの確認
docker compose logs -f

# 個別のログ確認
docker compose logs navidrome
docker compose logs music-locker-frontend
```

### 7.2 アクセス確認

ラズパイと同じネットワークにいる PC やスマホのブラウザから：

| サービス | URL |
|---|---|
| **フロントエンド（アップロードUI）** | `http://musiclocker.local:3000` |
| **Navidrome（音楽再生）** | `http://musiclocker.local:4533` |

> `musiclocker.local` で繋がらない場合は、`http://<ラズパイのIP>:3000` を使ってください。

---

## Step 8: 自動起動の設定

Docker の `restart: unless-stopped` が設定済みなので、Docker 自体が起動すれば自動的にコンテナも起動します。

```bash
# Docker を OS 起動時に自動起動するよう設定
sudo systemctl enable docker
```

これで **ラズパイの電源を入れるだけで自動的にサービスが立ち上がります**。

---

## Step 9: ファイアウォール設定（任意）

ラズパイにファイアウォールを設定する場合：

```bash
sudo apt install -y ufw

# SSH を許可（これを忘れるとSSH接続できなくなります！）
sudo ufw allow 22

# サービスのポートを許可
sudo ufw allow 3000    # フロントエンド
sudo ufw allow 4533    # Navidrome

# ファイアウォールを有効化
sudo ufw enable
```

---

## Step 10: 外出先からのアクセス（任意）

LAN 外からアクセスしたい場合は、以下の選択肢があります：

| 方法 | 難易度 | セキュリティ | 備考 |
|---|---|---|---|
| **Tailscale** | ⭐ 簡単 | 🔒 高い | 最もおすすめ。無料プランあり |
| **Cloudflare Tunnel** | ⭐⭐ 中程度 | 🔒 高い | 独自ドメインが必要 |
| **WireGuard VPN** | ⭐⭐⭐ 難しい | 🔒 最高 | 自前管理が必要 |
| ポートフォワーディング | ⭐⭐ 中程度 | ⚠️ 低い | **非推奨** |

> [!WARNING]
> ルーターのポートフォワーディングでサービスを直接公開するのは **セキュリティリスクが高いため非推奨** です。Tailscale などのトンネルサービスを使いましょう。

### Tailscale の導入例
```bash
# インストール
curl -fsSL https://tailscale.com/install.sh | sh

# 接続
sudo tailscale up

# 表示されたURLにアクセスしてログイン
```

接続後、Tailscale ネットワーク内のIPアドレスで各サービスにアクセスできます。

---

## トラブルシューティング

### コンテナが起動しない
```bash
# ログを確認
docker compose logs

# コンテナを完全にリセット
docker compose down -v
docker compose up -d --build
```

### Navidrome が Restarting を繰り返す
```bash
# パーミッションの問題が多い
sudo chown -R 1000:1000 backend/data
sudo chown -R 1000:1000 /mnt/music

# ログで詳細確認
docker compose logs navidrome
```

### ビルドが失敗する（メモリ不足）
```bash
# スワップを増やす
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 音楽ファイルが認識されない
- `MUSIC_FOLDER` のパスが正しいか確認
- 外付けドライブがマウントされているか確認: `df -h`
- ファイルの所有者を確認: `ls -la /mnt/music`
