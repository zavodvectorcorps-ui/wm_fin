# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Install yarn (Classic) inside the build image. It comes pre-bundled with Node 20-alpine
# but not always — make sure it's there.
RUN apk add --no-cache yarn

# Copy lockfile + package.json. Use yarn because react-scripts has known
# ajv/ajv-keywords resolution issues when installed with npm.
COPY package.json yarn.lock* package-lock.json* ./

RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
    else yarn install; fi

COPY . .

# Build-time env (baked into the bundle)
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# CRA treats ESLint warnings as errors when CI=true (Docker BuildKit sets it
# automatically). We want production builds to succeed even with cosmetic warnings.
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true

# Use the same package manager that did the install
RUN if [ -f yarn.lock ]; then yarn build; else npm run build; fi

# Stage 2: Serve with nginx
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
