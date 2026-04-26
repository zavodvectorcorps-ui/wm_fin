# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy only package.json. Lock files are optional — if package-lock.json
# is present we use `npm ci` (faster, reproducible), otherwise `npm install`.
COPY package.json ./
COPY package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
    else npm install --legacy-peer-deps; fi

COPY . .

# Build-time env (baked into the bundle)
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# CRA treats ESLint warnings as errors when CI=true (Docker BuildKit sets it
# automatically). We want production builds to succeed even with cosmetic warnings.
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
