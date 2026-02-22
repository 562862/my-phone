require('dotenv').config();

// 环境变量配置
const config = {
  port: parseInt(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'timi-dev-secret-change-in-production',
  jwtExpiresIn: '7d',
  // 初始管理员（首次启动自动创建）
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  // bcrypt 轮数
  bcryptRounds: 10,
};

module.exports = config;
