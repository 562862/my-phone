const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const prisma = new PrismaClient();

// JWT 认证中间件：验证 token 并检查 tokenVersion（单设备在线）
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, config.jwtSecret);

    // 查询用户，校验 tokenVersion
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ error: '账号已被封禁' });
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: '账号已在其他设备登录', code: 'KICKED' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token 已过期' });
    }
    return res.status(401).json({ error: '无效的 Token' });
  }
}

// 管理员权限中间件
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
