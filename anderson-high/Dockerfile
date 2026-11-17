FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
