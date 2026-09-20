FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app

# Production mode: express (under react-router-serve) uses it to disable the
# development-only error output, and it is what the rest of the stack expects.
ENV NODE_ENV=production

# Drop root. The server needs to read /app and bind a port, neither of which
# requires uid 0, and `node` is a non-root user the base image already
# provides. Without this a container escape starts as root on the host
# namespace mapping.
USER node

CMD ["npm", "run", "start"]