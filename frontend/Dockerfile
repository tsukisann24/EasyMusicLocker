# Build client
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Setup server
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client-dist

# Expose port
EXPOSE 3000

# Start server
CMD ["sh", "-c", "cd server && npm start"]
