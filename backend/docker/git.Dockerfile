# The GitHub container: git and GitHub's own CLI, nothing else. It holds the GitHub sign-in in its home volume and does
# the fork, the push and the pull request. It never sees a repository folder of TimeWraith: it gets a patch on stdin.
FROM alpine:3.20
RUN apk add --no-cache git github-cli \
    && adduser -D -u 1000 gh
USER gh
WORKDIR /home/gh
ENV HOME=/home/gh
ENTRYPOINT ["sleep", "infinity"]
