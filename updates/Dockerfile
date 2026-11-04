# The update feed's own container. Files live on a volume at /srv/updates, not in the image.
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/updates.conf
RUN mkdir -p /srv/updates
VOLUME /srv/updates
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
