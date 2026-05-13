FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_MAPBOX_TOKEN
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

RUN npm run build

EXPOSE 8080

CMD sh -c "cd /app/dist/server && /app/node_modules/.bin/wrangler dev index.js --no-remote --port ${PORT:-8080} --ip 0.0.0.0 --no-bundle"
