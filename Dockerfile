FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_MAPBOX_TOKEN
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# TanStack Start SSR build doesn't copy public/ subdirectories to dist/client/
# Copy entire public/data directory (not glob) to ensure all file types including .geojson
RUN cp -r public/data dist/client/data

EXPOSE 8080

CMD ["node", "/app/server.mjs"]
