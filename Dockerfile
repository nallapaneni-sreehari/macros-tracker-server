FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY views/ ./views/

EXPOSE 2727

CMD ["node", "server.js"]
