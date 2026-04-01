FROM node:22-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/server.js ./
COPY server/views/ ./views/
COPY server/templates/ ./templates/
COPY www/ ./www/

EXPOSE 2727

CMD ["node", "server.js"]
