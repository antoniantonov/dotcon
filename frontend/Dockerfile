# Build stage
FROM node:20-alpine AS build

WORKDIR /app

ARG REACT_APP_API_URL=http://localhost:4000
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve@14

COPY --from=build /app/build ./build

EXPOSE ${PORT:-3000}

CMD ["sh", "-c", "serve -s build -l ${PORT:-3000}"]
