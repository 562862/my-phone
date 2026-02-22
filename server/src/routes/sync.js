const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/sync/pull — 拉取云端数据
router.get('/pull', authMiddleware, async (req, res) => {
  try {
    const syncData = await prisma.syncData.findUnique({
      where: { userId: req.user.id },
    });

    if (!syncData) {
      return res.json({
        contacts: [],
        worldBooks: [],
        userPersonaPresets: [],
        thoughtPresets: [],
        myProfile: {},
        version: 0,
      });
    }

    res.json({
      contacts: syncData.contacts,
      worldBooks: syncData.worldBooks,
      userPersonaPresets: syncData.userPersonaPresets,
      thoughtPresets: syncData.thoughtPresets,
      myProfile: syncData.myProfile,
      version: syncData.version,
    });
  } catch (err) {
    console.error('拉取数据失败:', err);
    res.status(500).json({ error: '拉取数据失败' });
  }
});

// POST /api/sync/push — 推送本地数据到云端（乐观锁）
router.post('/push', authMiddleware, async (req, res) => {
  try {
    const { contacts, worldBooks, userPersonaPresets, thoughtPresets, myProfile, version } = req.body;

    if (version === undefined || version === null) {
      return res.status(400).json({ error: '缺少 version 字段' });
    }

    // 乐观锁：只有 version 匹配时才更新
    const result = await prisma.syncData.updateMany({
      where: {
        userId: req.user.id,
        version: version,
      },
      data: {
        contacts: contacts !== undefined ? contacts : undefined,
        worldBooks: worldBooks !== undefined ? worldBooks : undefined,
        userPersonaPresets: userPersonaPresets !== undefined ? userPersonaPresets : undefined,
        thoughtPresets: thoughtPresets !== undefined ? thoughtPresets : undefined,
        myProfile: myProfile !== undefined ? myProfile : undefined,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      // version 不匹配，说明有更新的数据
      const current = await prisma.syncData.findUnique({
        where: { userId: req.user.id },
      });
      return res.status(409).json({
        error: '数据冲突，云端有更新的版本',
        serverVersion: current ? current.version : 0,
      });
    }

    // 返回新版本号
    const updated = await prisma.syncData.findUnique({
      where: { userId: req.user.id },
    });

    res.json({ version: updated.version, message: '同步成功' });
  } catch (err) {
    console.error('推送数据失败:', err);
    res.status(500).json({ error: '推送数据失败' });
  }
});

module.exports = router;
