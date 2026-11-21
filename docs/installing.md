# Installing LarchBudget

LarchBudget is a small server that you open in a browser. Everything you
enter is kept in one database file. This page covers:

- [Installing with Docker](#with-docker)
- [Settings](#settings)
- [Password and HTTPS](#password-and-https)
- [Backing up](#backing-up)
- [Updating](#updating)
- [Running without Docker](#without-docker)

## With Docker

You need [Docker](https://docs.docker.com/get-started/get-docker/) and
[Git](https://git-scm.com).

```bash
git clone https://github.com/m-ers/LarchBudget.git
```

```bash
cd LarchBudget
```

```bash
docker compose up -d --build
```

Open http://localhost:3000. LarchBudget starts with an empty budget and asks
you to add your first account.

The database is kept in a Docker volume called `larchbudget-data`, so it
stays when you update or restart LarchBudget.

## Settings

| Setting         | Default                       | What it does                                                                                                |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `APP_PASSWORD`  | _(empty)_                     | When set, every page asks for this password first.                                                          |
| `CURRENCY`      | `EUR`                         | The currency of your budget, as a three-letter code such as `USD` or `GBP`.                                 |
| `LOCALE`        | `en-US`                       | How numbers and dates are written, and how you type amounts. For example `nl-NL` writes 1.234,56.           |
| `TZ`            | server's zone (UTC in Docker) | Your time zone, for example `Europe/Amsterdam`. It decides what "today" and "this month" are.               |
| `DATABASE_PATH` | `./data/larchbudget.db`       | Where the database file is. With Docker this is fixed to the volume; see [without Docker](#without-docker). |

A currency or locale that is not valid is ignored: the server log says so,
and the default is used.

With Docker, put your settings in a file called `.env` next to
`docker-compose.yml`:

```ini
APP_PASSWORD=a-long-password-of-your-own
CURRENCY=EUR
LOCALE=nl-NL
TZ=Europe/Amsterdam
```

Then start LarchBudget again, so it picks them up:

```bash
docker compose up -d
```

## Password and HTTPS

Without `APP_PASSWORD`, anyone who can reach LarchBudget can read and change
your finances. That is fine on a computer only you use. Before LarchBudget
can be reached from other devices or from the internet:

1. **Set `APP_PASSWORD`.** Choose a long one: the login does not slow down
   someone who keeps guessing yet.
2. **Use HTTPS**, so the password and your figures cannot be read on the way.
   The usual way is a reverse proxy in front of LarchBudget, such as
   [Caddy](https://caddyserver.com) or [Traefik](https://traefik.io). The
   proxy has to tell LarchBudget that the visitor came in over HTTPS, with
   the `X-Forwarded-Proto` header; Caddy and Traefik send it by themselves.

After logging in you stay logged in for 30 days on that browser, or until
you choose **Log out**. Changing `APP_PASSWORD` logs every browser out.

## Backing up

Stop LarchBudget first, then copy the whole data folder. While LarchBudget
runs, the database is more than one file (`larchbudget.db`, plus
`larchbudget.db-wal` and `larchbudget.db-shm`), and a copy of
`larchbudget.db` alone can miss your latest changes.

```bash
docker compose stop
```

```bash
docker compose cp larchbudget:/data ./larchbudget-backup
```

```bash
docker compose start
```

Without Docker, stop LarchBudget and copy the folder that holds the database
in the same way. To restore, stop LarchBudget and put the folder's files
back.

Backing up and restoring from within LarchBudget is
[planned](https://github.com/m-ers/LarchBudget/issues/37).

## Updating

Make a [backup](#backing-up) first. Then, in the LarchBudget folder:

```bash
git pull
```

```bash
docker compose up -d --build
```

The database is brought up to date by itself the first time the new version
opens it. Until 1.0.0, anything may still change between versions: read the
[release notes](https://github.com/m-ers/LarchBudget/releases) before you
update.

## Without Docker

You need [Node.js](https://nodejs.org) 24 or newer and Git.

To try LarchBudget or work on it, the development server is enough: see
[Development](development.md#run-it-locally).

To run it for real, build it once and start the built server:

```bash
git clone https://github.com/m-ers/LarchBudget.git
```

```bash
cd LarchBudget
```

```bash
npm ci
```

```bash
npm run build
```

```bash
cp -r .next/static .next/standalone/.next/static
```

```bash
DATABASE_PATH=/home/you/larchbudget/larchbudget.db node .next/standalone/server.js
```

Open http://localhost:3000.

- **Always set `DATABASE_PATH`, as a full path** to a folder outside the
  LarchBudget code. Without it, the built server keeps the database inside
  its own build folder, and the next `npm run build` deletes that folder.
- Other settings go in front of the command in the same way, for example
  `APP_PASSWORD=... TZ=Europe/Amsterdam`.
- `PORT` chooses the port (3000 when not set). `HOSTNAME` chooses who can
  reach it: other devices on your network can when it is not set, and
  `HOSTNAME=127.0.0.1` keeps it to this computer.
- To update: make a backup, stop LarchBudget, run `git pull`, and repeat the
  steps from `npm ci`.
