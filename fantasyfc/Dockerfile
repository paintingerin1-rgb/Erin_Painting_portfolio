# Two stages: build the static bundle with Node, serve it with nginx.
#
# IMPORTANT: Vite inlines VITE_* variables at BUILD time, not runtime. They must
# be passed as --build-arg; setting them with `docker run -e` does nothing,
# because by then the values are already baked into the JS bundle.
#
#   docker build \
#     --build-arg VITE_SUPABASE_URL=... \
#     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
#     -t cuneiform .
#
# Only the publishable (anon) key belongs here. It is safe client-side by
# design - RLS is what actually protects the data. Never the service_role key.

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
