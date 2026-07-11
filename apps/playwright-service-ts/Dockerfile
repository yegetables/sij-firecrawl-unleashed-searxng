FROM node:20-slim

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

COPY . .

RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN npm run build

# Pre-warm CloakBrowser's patched Chromium binary into the image
RUN npx cloakbrowser install

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "npm", "start" ]