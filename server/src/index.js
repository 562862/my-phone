const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const adminRoutes = require('./routes/admin');

const app = express();

// 中间件
app.use(compression()); // gzip 压缩所有响应
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 同步数据可能较大

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/admin', adminRoutes);

// 管理后台静态文件
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// 前端静态文件（项目根目录）
app.use(express.static(path.join(__dirname, '../../'), {
  index: 'index.html',
  maxAge: '7d', // 静态资源缓存 7 天
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML 不缓存，确保更新及时生效
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA 回退：非 API、非静态文件的请求返回 index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API 路径不存在' });
  }
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, '../admin/index.html'));
  }
  res.sendFile(path.join(__dirname, '../../index.html'));
});

// 启动服务器
app.listen(config.port, () => {
  console.log(`Timi 后端服务已启动: http://localhost:${config.port}`);
  console.log(`管理后台: http://localhost:${config.port}/admin`);
  // 初始化管理员账号
  initAdmin();
});

// 自动创建管理员账号
async function initAdmin() {
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({
      where: { username: config.adminUsername },
    });

    if (!existing) {
      const passwordHash = await bcrypt.hash(config.adminPassword, config.bcryptRounds);
      await prisma.user.create({
        data: {
          username: config.adminUsername,
          passwordHash,
          role: 'admin',
        },
      });
      console.log(`管理员账号已创建: ${config.adminUsername}`);
    }
  } catch (err) {
    console.error('初始化管理员失败:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
