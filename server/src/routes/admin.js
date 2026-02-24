const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 所有 admin 路由都需要认证 + 管理员权限
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/stats — 统计面板
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { status: 'active' } });
    const bannedUsers = await prisma.user.count({ where: { status: 'banned' } });
    const totalCodes = await prisma.inviteCode.count();
    const usedCodes = await prisma.inviteCode.count({ where: { used: true } });

    // 今日注册
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRegistered = await prisma.user.count({
      where: { createdAt: { gte: today } },
    });

    res.json({ totalUsers, activeUsers, bannedUsers, totalCodes, usedCodes, todayRegistered });
  } catch (err) {
    console.error('获取统计失败:', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// GET /api/admin/users — 用户列表（分页、搜索）
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const search = req.query.search || '';

    const where = search
      ? { username: { contains: search, mode: 'insensitive' } }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, username: true, role: true, status: true,
          createdAt: true, updatedAt: true,
          inviteCode: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// PATCH /api/admin/users/:id/ban — 封禁/解封用户
router.patch('/users/:id/ban', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'admin') return res.status(400).json({ error: '不能封禁管理员' });

    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        status: newStatus,
        // 封禁时递增 tokenVersion 使其立即下线
        ...(newStatus === 'banned' ? { tokenVersion: { increment: 1 } } : {}),
      },
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error('封禁操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// PATCH /api/admin/users/:id/reset-password — 重置密码
router.patch('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 个字符' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    res.json({ message: '密码已重置' });
  } catch (err) {
    console.error('重置密码失败:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// DELETE /api/admin/users/:id — 删除用户及其数据
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'admin') return res.status(400).json({ error: '不能删除管理员' });

    // Cascade 会自动删除 SyncData
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: '用户已删除' });
  } catch (err) {
    console.error('删除用户失败:', err);
    res.status(500).json({ error: '删除用户失败' });
  }
});

// POST /api/admin/invite-codes — 批量生成邀请码
router.post('/invite-codes', async (req, res) => {
  try {
    const count = Math.min(100, Math.max(1, parseInt(req.body.count) || 1));
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push({
        code: crypto.randomBytes(4).toString('hex').toUpperCase(),
        expiresAt,
      });
    }

    await prisma.inviteCode.createMany({ data: codes });

    const created = await prisma.inviteCode.findMany({
      where: { code: { in: codes.map(c => c.code) } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ codes: created });
  } catch (err) {
    console.error('生成邀请码失败:', err);
    res.status(500).json({ error: '生成邀请码失败' });
  }
});

// GET /api/admin/invite-codes — 邀请码列表
router.get('/invite-codes', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const [codes, total] = await Promise.all([
      prisma.inviteCode.findMany({
        include: { usedBy: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inviteCode.count(),
    ]);

    res.json({ codes, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('获取邀请码列表失败:', err);
    res.status(500).json({ error: '获取邀请码列表失败' });
  }
});

// DELETE /api/admin/invite-codes/:id — 删除邀请码
router.delete('/invite-codes/:id', async (req, res) => {
  try {
    await prisma.inviteCode.delete({ where: { id: req.params.id } });
    res.json({ message: '邀请码已删除' });
  } catch (err) {
    console.error('删除邀请码失败:', err);
    res.status(500).json({ error: '删除邀请码失败' });
  }
});

module.exports = router;
