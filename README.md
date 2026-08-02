<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/AWS_S3-FF9900?style=for-the-badge&logo=amazons3&logoColor=white"/>
  <img src="https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazon-dynamodb&logoColor=white"/>
  <img src="https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white"/>
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white"/>
</p>

<h1 align="center">☁️ CloudVault — Distributed File Storage</h1>

<p align="center">
  A fault-tolerant, distributed file storage system powered by AWS S3, DynamoDB and Nginx load balancing.<br/>
  <strong>Zero disk usage</strong> · <strong>Permanent shareable links</strong> · <strong>Auto health-check failover</strong>
</p>

<p align="center">
  <a href="https://github.com/Adhi1029/distributed-file-storage">
    <img src="https://img.shields.io/github/repo-size/Adhi1029/distributed-file-storage?color=6366f1&style=flat-square"/>
  </a>
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square"/>
  <img src="https://img.shields.io/badge/status-active-22c55e?style=flat-square"/>
</p>

---

## 📐 System Architecture

```
        [ Client Browser ]
               │
        (HTTP Requests)
               │
               ▼
  ┌─── Nginx Load Balancer ───┐
  │   (Health Check Failover) │
  └───────────┬───────────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
[Node.js :3001]  [Node.js :3002]
     │                 │
     └────────┬────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
[  AWS S3 Bucket  ] [Amazon DynamoDB]
(Actual File Store) (File Metadata)
```

Files stream **directly from the browser to S3** via `multer-s3` — the servers never write anything to disk. DynamoDB stores metadata (file ID, S3 key, name, size, MIME type, upload date).

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🚀 **Zero disk usage** | Files stream browser → S3 via multer-s3. No temp files ever |
| 🔗 **Shareable links** | Permanent `/share/:fileId` link. Each visit gets a fresh 1-hr presigned URL |
| 🛡 **Fault tolerant** | Nginx polls both Node.js instances every 10s. Unhealthy server auto-removed |
| 📦 **DynamoDB metadata** | File IDs, S3 keys, sizes, MIME types, timestamps — instant lookups at scale |
| ⚡ **Presigned downloads** | Time-limited S3 URLs — your credentials are never exposed to downloaders |
| 🎨 **Multi-page frontend** | Homepage · Dashboard · About · Pricing · Contact |
| 🌓 **Light / Dark theme** | Follows OS preference automatically, manual toggle persists to localStorage |
| 📱 **Fully responsive** | Works on mobile, tablet and desktop |

---

## 📁 Project Structure

```
distributed-file-storage/
├── backend/                  # Node.js / Express API
│   ├── server.js             # Main server (upload, download, share, delete)
│   ├── package.json
│   └── .env.example          # Environment variable template
│
├── frontend/                 # Static HTML/CSS/JS website
│   ├── index.html            # Landing homepage
│   ├── dashboard.html        # File manager dashboard
│   ├── about.html            # About page
│   ├── services.html         # Pricing & services page
│   ├── contact.html          # Contact form & map
│   ├── style.css             # Complete design system (light/dark themes)
│   ├── app.js                # Dashboard logic (upload, dropdown menus, share modal)
│   └── nav.js                # Shared nav behaviour (theme toggle, hamburger)
│
└── nginx/
    └── nginx.conf            # Load balancer + health check configuration
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+
- **npm** v8+
- **AWS Account** with:
  - An S3 bucket
  - A DynamoDB table
  - IAM user with S3 + DynamoDB permissions

### 1 — Clone the repo

```bash
git clone https://github.com/Adhi1029/distributed-file-storage.git
cd distributed-file-storage
```

### 2 — Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your AWS credentials:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
DYNAMODB_TABLE_NAME=your-table-name
```

### 3 — Install dependencies

```bash
npm install
```

### 4 — Start the servers

**Terminal 1 — Server on port 3001:**
```bash
PORT=3001 node server.js
```

**Terminal 2 — Server on port 3002:**
```bash
PORT=3002 node server.js
```

### 5 — Open the frontend

Open `frontend/index.html` in your browser, navigate to the **Dashboard** and start uploading.

> **With Nginx (optional):** Configure `nginx/nginx.conf` and start Nginx to enable load balancing across both server instances.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (used by Nginx) |
| `POST` | `/upload` | Upload a file to S3 + save metadata to DynamoDB |
| `GET` | `/files` | List all stored files from DynamoDB |
| `GET` | `/download/:fileId` | Get a presigned S3 download URL |
| `GET` | `/share/:fileId` | Generate share URL → 302 redirect to presigned S3 URL |
| `DELETE` | `/delete/:fileId` | Delete file from S3 and remove metadata from DynamoDB |

### Upload example

```bash
curl -X POST http://localhost:3001/upload \
  -F "file=@/path/to/your/file.pdf"
```

Response:
```json
{
  "message": "File uploaded successfully",
  "fileId": "a1b2c3d4-...",
  "fileName": "file.pdf",
  "size": 102400
}
```

### Share link example

```bash
# Anyone can use this permanent link — no auth needed
curl -L http://localhost:3001/share/a1b2c3d4-...
# → 302 redirect to a 1-hour presigned S3 download URL
```

---

## ☁️ AWS Setup

### S3 Bucket

1. Go to **S3 Console** → Create bucket (e.g. `my-cloudvault-bucket`)
2. Region: `us-east-1` (or match your `AWS_REGION`)
3. Leave Block Public Access **ON** — we use presigned URLs for secure access

### DynamoDB Table

1. Go to **DynamoDB Console** → Create table
2. **Table name**: match your `DYNAMODB_TABLE_NAME`
3. **Partition key**: `fileId` (String)

### IAM Permissions

Your IAM user needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Scan",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/your-table-name"
    }
  ]
}
```

---

## ⚙️ Nginx Configuration

The `nginx/nginx.conf` sets up round-robin load balancing with automatic health check failover:

```nginx
upstream backend_pool {
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
}
```

If a server fails 3 consecutive health checks, Nginx removes it from the pool for 30 seconds and all traffic goes to the surviving instance.

**Install & run Nginx (macOS):**
```bash
brew install nginx
cp nginx/nginx.conf /usr/local/etc/nginx/nginx.conf
nginx
```

---

## 🖼 Screenshots

### Homepage
A modern landing page with the system architecture diagram, feature highlights, and quick navigation links.

### Dashboard
Upload files via drag & drop, view all stored files in a table, and access **Share / Download / Delete** via a dropdown action menu per file.

### Share Modal
Every file gets a permanent shareable link (`/share/:fileId`). Click **Copy** to copy it to clipboard. Anyone with the link can download the file without needing an account.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express |
| File streaming | multer, multer-s3 |
| Object storage | AWS S3 |
| Metadata store | Amazon DynamoDB |
| Load balancer | Nginx |
| AWS SDK | `@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb`, `@aws-sdk/s3-request-presigner` |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Fonts | Inter, JetBrains Mono (Google Fonts) |

---

## 🔐 Security Notes

- **Never commit `.env`** — it contains your AWS credentials. It is excluded by `.gitignore`.
- Use **`.env.example`** as a template for other contributors.
- Presigned URLs expire after **1 hour** — even if a share link is leaked, the underlying S3 URL rotates on every visit.
- S3 bucket stays **fully private** — only the server generates short-lived access URLs.

---

## 📜 License

MIT — feel free to use, modify and distribute.

---

<p align="center">Built with ❤️ by <a href="https://github.com/Adhi1029">Adithya Raj</a> · Powered by Node.js, AWS &amp; Nginx</p>
