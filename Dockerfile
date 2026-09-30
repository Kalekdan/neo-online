# Web-only container image for the self-hosted browser version of NEO.
# This does not build, package, or run the Electron desktop application.
FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3000
ENV NEO_LIBRARY_DIR=/data/NEO\ Library
VOLUME ["/data"]
EXPOSE 3000

# Run the web server; Electron startup remains available through npm start.
CMD ["node", "server.js"]
