FROM node:20-alpine

WORKDIR /app/server

# 先复制 Prisma schema
COPY server/prisma ./prisma

# 安装依赖，跳过 postinstall 避免 prisma generate 需要 DATABASE_URL
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# 手动生成 Prisma Client（不需要真实数据库连接）
RUN npx prisma generate

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
