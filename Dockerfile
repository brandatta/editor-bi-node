FROM node:20-alpine

WORKDIR /app

# Dependencias
COPY package*.json ./
RUN npm ci --omit=dev

# Código
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
