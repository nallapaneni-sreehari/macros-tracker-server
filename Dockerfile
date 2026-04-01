FROM node:22-alpine

WORKDIR /app

COPY macros-tracker-server/package.json macros-tracker-server/package-lock.json* ./
RUN npm ci --omit=dev

COPY macros-tracker-server/server.js ./
COPY macros-tracker-server/views/ ./views/
COPY macros-tracker-server/templates/ ./templates/
COPY www/ ./www/

EXPOSE 2727

CMD ["node", "server.js"]
