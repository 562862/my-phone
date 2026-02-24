const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 生成 JWT
function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, tokenVersion: user.tokenVersion },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// POST /api/auth/register — 邀请码注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;

    if (!username || !password || !inviteCode) {
      return res.status(400).json({ error: '用户名、密码和邀请码不能为空' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度 2-20 个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 个字符' });
    }

    // 校验邀请码
    const code = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
    if (!code) {
      return res.status(400).json({ error: '邀请码无效' });
    }
    if (code.used) {
      return res.status(400).json({ error: '邀请码已被使用' });
    }
    if (code.expiresAt && code.expiresAt < new Date()) {
      return res.status(400).json({ error: '邀请码已过期' });
    }

    // 检查用户名是否已存在
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 创建用户 + 标记邀请码已使用（事务）
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { username, passwordHash, inviteCodeId: code.id },
      });
      await tx.inviteCode.update({
        where: { id: code.id },
        data: { used: true },
      });
      // 创建空的同步数据
      await tx.syncData.create({
        data: { userId: newUser.id },
      });
      return newUser;
    });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// POST /api/auth/login — 登录（递增 tokenVersion 踢前设备）
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ error: '账号已被封禁' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 递增 tokenVersion，使旧 token 失效（踢前设备）
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    const token = signToken(updated);
    res.json({ token, user: { id: updated.id, username: updated.username, role: updated.role } });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// POST /api/auth/logout — 登出（递增 tokenVersion）
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    res.json({ message: '已登出' });
  } catch (err) {
    console.error('登出失败:', err);
    res.status(500).json({ error: '登出失败' });
  }
});

// GET /api/auth/me — 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    createdAt: req.user.createdAt,
  });
});

// POST /api/auth/change-password — 修改密码
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 个字符' });
    }

    const valid = await bcrypt.compare(oldPassword, req.user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '旧密码错误' });
    }

    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    res.json({ message: '密码已修改，请重新登录' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.status(500).json({ error: '修改密码失败' });
  }
});

module.exports = router;
