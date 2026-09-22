FROM mirror.gcr.io/library/debian:bookworm-slim

RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends squid \
 && rm -rf /var/lib/apt/lists/*

COPY squid.conf /etc/squid/squid.conf

EXPOSE 3128

CMD ["squid", "-N", "-f", "/etc/squid/squid.conf"]
