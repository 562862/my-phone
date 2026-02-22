FROM node:20-alpine

WORKDIR /app/server

# 先复制 Prisma schema（postinstall 的 prisma generate 需要它）
COPY server/prisma ./prisma

# 安装依赖（设置占位 DATABASE_URL，prisma generate 构建时需要）
COPY server/package*.json ./
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm ci --omit=dev

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
