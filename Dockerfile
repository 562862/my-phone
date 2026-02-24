FROM node:20-alpine

WORKDIR /app/server

# 先复制 Prisma schema（供 postinstall 中 prisma generate 使用）
COPY server/prisma ./prisma

# 安装依赖（postinstall 会自动执行 prisma generate）
COPY server/package*.json ./
RUN npm ci

# 复制后端代码
COPY server/src ./src
COPY server/admin ./admin

# 复制前端文件到上级目录
WORKDIR /app
COPY index.html sw.js manifest.json ./
COPY icons ./icons

WORKDIR /app/server

EXPOSE 3000

# 启动时先执行数据库迁移，再启动服务
CMD ["sh", "-c", "npx prisma db push --skip-generate && node src/index.js"]
