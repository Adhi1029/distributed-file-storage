/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Distributed File Storage — Core Server (Node.js / Express) │
 * │  Runs on PORT 3001 or 3002; Nginx load-balances between them │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Routes:
 *   GET  /health              → Health check for Nginx
 *   POST /upload              → Upload file → S3, metadata → DynamoDB
 *   GET  /files               → List all files from DynamoDB
 *   GET  /download/:fileId    → Generate presigned S3 download URL
 *   DELETE /delete/:fileId    → Remove file from S3 + DynamoDB
 */

require('dotenv').config();

const express  = require('express');
const multer   = require('multer');
const multerS3 = require('multer-s3');
const cors     = require('cors');

const {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
} = require('@aws-sdk/client-dynamodb');

const { v4: uuidv4 } = require('uuid');

// ─── App Setup ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors());                        // Allow frontend on different origin/port

// ─── AWS Clients ───────────────────────────────────────────────
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const s3Client     = new S3Client(awsConfig);
const dynamoClient = new DynamoDBClient(awsConfig);

const BUCKET     = process.env.S3_BUCKET_NAME;
const TABLE      = process.env.DYNAMO_TABLE_NAME || 'FileMetadata';
const MAX_MB     = parseInt(process.env.MAX_UPLOAD_MB || '50', 10);

// ─── Multer → Direct S3 Upload (Zero Local Disk) ───────────────
const upload = multer({
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  storage: multerS3({
    s3:     s3Client,
    bucket: BUCKET,
    metadata: (_req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (_req, file, cb) => {
      const fileId = uuidv4();
      // Store fileId as a prefix so we can extract it later
      cb(null, `${fileId}__${file.originalname}`);
    },
  }),
});

// ─── Utility: extract fileId from S3 key ───────────────────────
const idFromKey = (key) => key.split('__')[0];

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

/**
 * GET /
 * Root route / health check for Vercel deployment
 */
app.get('/', (req, res) => {
  res.status(200).send('Distributed File Storage API is running!');
});

/**
 * GET /health
 * Nginx polls this endpoint every few seconds to decide if this
 * instance is healthy. Returns 200 with basic server info.
 */
app.get('/health', (_req, res) => {
  res.status(200).json({
    status:    'healthy',
    port:      process.env.PORT || 3000,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
/**
 * POST /upload
 * Accepts multipart/form-data with a field named "file".
 * Streams directly to S3 (no local temp file).
 * Writes metadata (fileId, s3Key, fileName, size, uploadDate)
 * into DynamoDB.
 *
 * Multer middleware is called manually so errors are caught
 * and returned as JSON instead of crashing the process.
 */
app.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[UPLOAD] Multer error:', err.message);
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
  }

  const s3Key   = req.file.key;
  const fileId  = idFromKey(s3Key);
  const fileSize = (req.file.size || 0).toString();

  try {
    await dynamoClient.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        fileId:     { S: fileId },
        s3Key:      { S: s3Key },
        fileName:   { S: req.file.originalname },
        size:       { N: fileSize },
        mimeType:   { S: req.file.mimetype || 'application/octet-stream' },
        uploadDate: { S: new Date().toISOString() },
        // req.file.location is the public S3 URL (only if bucket is public)
        s3Url:      { S: req.file.location || '' },
      },
    }));

    return res.status(201).json({
      message:  'File uploaded successfully',
      fileId,
      fileName: req.file.originalname,
      size:     req.file.size,
    });
  } catch (err) {
    console.error('[UPLOAD] DynamoDB error:', err);
    return res.status(500).json({ error: 'File uploaded to S3 but metadata save failed.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
/**
 * GET /files
 * Returns a list of all file metadata records from DynamoDB.
 * Uses a Scan (fine for moderate scale; use GSI + Query for prod).
 */
app.get('/files', async (_req, res) => {
  try {
    const { Items } = await dynamoClient.send(new ScanCommand({ TableName: TABLE }));

    const files = (Items || []).map((item) => ({
      fileId:     item.fileId?.S,
      fileName:   item.fileName?.S,
      size:       item.size?.N ? parseInt(item.size.N, 10) : 0,
      mimeType:   item.mimeType?.S,
      uploadDate: item.uploadDate?.S,
    }));

    // Most recent first
    files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    return res.status(200).json({ files });
  } catch (err) {
    console.error('[LIST] DynamoDB error:', err);
    return res.status(500).json({ error: 'Failed to list files.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
/**
 * GET /download/:fileId
 * Fetches the S3 key from DynamoDB then generates a time-limited
 * presigned URL (1 hour). The client receives the URL and can
 * download directly from S3 — no data passes through this server.
 */
app.get('/download/:fileId', async (req, res) => {
  const { fileId } = req.params;

  try {
    const { Item } = await dynamoClient.send(new GetItemCommand({
      TableName: TABLE,
      Key: { fileId: { S: fileId } },
    }));

    if (!Item) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key:    Item.s3Key.S,
      ResponseContentDisposition: `attachment; filename="${Item.fileName.S}"`,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return res.status(200).json({
      downloadUrl,
      fileName:   Item.fileName.S,
      expiresIn:  '1 hour',
    });
  } catch (err) {
    console.error('[DOWNLOAD] Error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
/**
 * GET /share/:fileId
 * Public shareable link endpoint.
 * Looks up the file in DynamoDB, generates a fresh presigned S3 URL,
 * then HTTP 302-redirects the visitor directly to S3.
 *
 * The /share/:fileId URL itself never expires — each visit generates
 * a new 1-hour presigned URL on the fly. Share this link with anyone.
 *
 * Example: http://localhost:3001/share/8fbc1e2c-...
 */
app.get('/share/:fileId', async (req, res) => {
  const { fileId } = req.params;

  try {
    const { Item } = await dynamoClient.send(new GetItemCommand({
      TableName: TABLE,
      Key: { fileId: { S: fileId } },
    }));

    if (!Item) {
      return res.status(404).send(`
        <!DOCTYPE html><html><head><title>File Not Found — CloudVault</title>
        <style>body{font-family:system-ui,sans-serif;background:#08090f;color:#f0f0ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
        h1{font-size:1.5rem;color:#ef4444}p{color:#9293a5;font-size:.9rem}</style></head>
        <body><h1>❌ File Not Found</h1><p>This file may have been deleted or the link is invalid.</p></body></html>
      `);
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key:    Item.s3Key.S,
      ResponseContentDisposition: `attachment; filename="${Item.fileName.S}"`,
    });

    // Fresh presigned URL — valid for 1 hour from time of visit
    const redirectUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    console.log(`[SHARE] Redirecting share link for fileId=${fileId} → ${Item.fileName.S}`);

    // Redirect browser to S3 — download starts immediately
    return res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('[SHARE] Error:', err);
    return res.status(500).send('Failed to process share link.');
  }
});


// ─────────────────────────────────────────────────────────────
/**
 * DELETE /delete/:fileId
 * Two-phase delete:
 *  1. Fetch S3 key from DynamoDB
 *  2. Delete object from S3
 *  3. Delete metadata record from DynamoDB
 */
app.delete('/delete/:fileId', async (req, res) => {
  const { fileId } = req.params;

  try {
    // Phase 1 — fetch metadata
    const { Item } = await dynamoClient.send(new GetItemCommand({
      TableName: TABLE,
      Key: { fileId: { S: fileId } },
    }));

    if (!Item) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const s3Key = Item.s3Key.S;

    // Phase 2 — delete from S3
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));

    // Phase 3 — delete from DynamoDB
    await dynamoClient.send(new DeleteItemCommand({
      TableName: TABLE,
      Key: { fileId: { S: fileId } },
    }));

    return res.status(200).json({ message: 'File deleted successfully.', fileId });
  } catch (err) {
    console.error('[DELETE] Error:', err);
    return res.status(500).json({ error: 'Failed to delete file.', detail: err.message });
  }
});

// ─── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global Error Handler ────────────────────────────────────────
// Catches any unhandled errors thrown in route handlers or middleware.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error.',
  });
});

// ─── Start Server ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`
  ┌──────────────────────────────────────────┐
  │  🚀 Distributed Storage Server Running   │
  │  Port    : ${PORT}                           │
  │  Region  : ${process.env.AWS_REGION || 'not set'}              │
  │  Bucket  : ${process.env.S3_BUCKET_NAME || 'not set'}│
  │  Table   : ${TABLE}             │
  └──────────────────────────────────────────┘
  `);
});

module.exports = app;
