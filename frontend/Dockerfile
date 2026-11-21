# Multi-stage Dockerfile para Frontend Angular 18+ con Nginx
FROM node:20-alpine AS build

WORKDIR /app

# Instalar dependencias con caché optimizada
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit

# Compilar proyecto Angular en modo producción
COPY . .
RUN npm run build -- --configuration production

# Etapa 2: Servidor Web Nginx ultraligero
FROM nginx:alpine

# Copiar configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar bundle de Angular compilado
COPY --from=build /app/dist/neuroanatomy-3d-frontend/browser /usr/share/nginx/html

# Exponer puerto 4200
EXPOSE 4200

CMD ["nginx", "-g", "daemon off;"]
