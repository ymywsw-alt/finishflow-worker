FROM node:18-alpine

RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "make.js"]
