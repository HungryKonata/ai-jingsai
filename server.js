const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const config = require('./config');
const { initDatabase, closeDatabase } = require('./services/db');

// 路由
const knowledgeRoutes = require('./routes/knowledge');
const categoryRoutes = require('./routes/categories');
const queryRoutes = require('./routes/query');
const aiConfigRoutes = require('./routes/aiConfig');

// 创建Express应用
const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传配置
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = config.upload.dir;
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  }),
  limits: {
    fileSize: config.upload.maxSize
  },
  fileFilter: (req, file, cb) => {
    // 只允许文本、Markdown文件
    const allowedTypes = ['.md', '.txt', '.markdown'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持上传 Markdown 或文本文件'));
    }
  }
});

// API路由
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/ai', aiConfigRoutes);

// 文件上传导入接口
app.post('/api/knowledge/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传文件' });
    }
    
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 清理上传的文件
    fs.unlinkSync(filePath);
    
    // 解析并导入
    const { parseMarkdownContent } = require('./routes/knowledge');
    const items = parseMarkdownContent(content);
    
    // 获取数据库连接
    const db = require('./services/db').getDb();
    let importedCount = 0;
    
    const insertMany = db.transaction((itemsToInsert) => {
      for (const item of itemsToInsert) {
        let categoryId = null;
        if (item.category) {
          const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(item.category);
          if (category) {
            categoryId = category.id;
          } else {
            const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(item.category);
            categoryId = result.lastInsertRowid;
          }
        }
        
        if (item.question && item.answer) {
          db.prepare(`
            INSERT INTO knowledge_items (question, answer, category_id, keywords)
            VALUES (?, ?, ?, ?)
          `).run(item.question, item.answer, categoryId, JSON.stringify(item.keywords || []));
          importedCount++;
        }
      }
    });
    
    insertMany(items);
    
    res.json({
      success: true,
      message: `成功导入 ${importedCount} 条知识条目`,
      importedCount
    });
  } catch (error) {
    console.error('文件导入失败:', error);
    res.status(500).json({ success: false, message: '文件导入失败' });
  }
});

// API健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Department Knowledge Base',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 前端路由（SPA支持）
app.get(['/', '/list', '/admin', '/settings'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  
  // 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: '文件大小超过限制（最大5MB）' });
  }
  
  res.status(500).json({
    success: false,
    message: '服务器内部错误，请稍后重试'
  });
});

// 404处理
app.use((req, res) => {
  // API路由返回JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: '接口不存在'
    });
  }
  
  // 其他路由返回首页（SPA支持）
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
function startServer() {
  // 初始化数据库
  initDatabase();
  
  const PORT = config.server.port;
  const HOST = config.server.host;
  
  app.listen(PORT, HOST, () => {
    console.log('========================================');
    console.log('  部门常见问题知识库系统');
    console.log('  Department Knowledge Base System');
    console.log('========================================');
    console.log('');
    console.log(`  服务地址: http://localhost:${PORT}`);
    console.log(`  API文档: http://localhost:${PORT}/api/health`);
    console.log('');
    console.log('  启动时间:', new Date().toLocaleString());
    console.log('========================================');
  });
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...');
  closeDatabase();
  process.exit(0);
});

startServer();