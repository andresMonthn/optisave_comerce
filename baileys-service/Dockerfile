FROM node:20-alpine

# Baileys y dependencias pueden requerir git al instalar
RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./

RUN mkdir -p /app/sessions

ENV PORT=3001
ENV SESSION_DIR=/app/sessions

EXPOSE 3001

VOLUME ["/app/sessions"]

CMD ["node", "index.js"]
