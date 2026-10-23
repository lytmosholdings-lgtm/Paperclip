---
title: Teams Home Setup Runbook
summary: Phases 5–10 for a home Ubuntu install running from source with pnpm dev
---

Phases 1–4 (backup, upgrade to the `teams` branch, settings) are done. These
phases add Teams notifications, the Communications Officer, an always-on
service, a webhook-only tunnel, and the Microsoft setup. Assumes the code is
in `~/paperclip` and Paperclip runs in `local_trusted` mode on port 3100.

Steps marked **(you)** need a browser sign-in, a sudo password, or a
Microsoft/Cloudflare account and must be done by the person, not an agent.

## Phase 5 — Teams notifications

After this phase, agent questions, approvals, and finished or blocked work
arrive in Teams. No Azure or tunnel needed.

1. **(you)** In Teams, create a group chat named "Paperclip HQ".
2. **(you)** In that chat, open **… → Workflows**, choose **Send webhook
   alerts to a chat**, name it "Paperclip", select the chat, finish. Copy the
   URL and keep it private.
3. Build and install the plugin (Paperclip running):

   ```bash
   cd ~/paperclip
   pnpm --filter @paperclipai/plugin-teams-notifier build
   pnpm paperclipai plugin install "$PWD/packages/plugins/plugin-teams-notifier"
   pnpm paperclipai plugin list
   ```

   Check `paperclip.teams-notifier` is listed as ready.
4. **(you)** In Paperclip, **Company settings → Plugins → Microsoft Teams
   Notifier**: set **Teams Workflow URL** to the copied URL and **Paperclip
   board URL** to `http://localhost:3100`. Leave event switches at defaults.
5. Test: mark a small task done. A "Work completed" card should appear in
   Paperclip HQ within a minute. If not, check the plugin's log in Paperclip.

## Phase 6 — Communications Officer and agent instructions

1. Officer instructions:
   `packages/plugins/plugin-teams-notifier/templates/communications-officer/AGENTS.md`.
2. Hire an agent named **Comms Officer** and set those as its instructions.
3. On its page, turn on **Can assign tasks**.
4. Append
   `packages/plugins/plugin-teams-notifier/templates/reaching-the-board.md`
   to every other agent's instructions.
5. In the notifier plugin settings, set **Communications officer agent** to
   `Comms Officer`.

Background: `docs/guides/board-operator/communications-officer.md`.

## Phase 7 — Keep Paperclip running after reboots

1. Restrict the instance env file, which may hold secrets:

   ```bash
   chmod 600 ~/.paperclip/instances/default/.env
   ```

2. Back up the instance before switching to systemd:

   ```bash
   cp -a ~/.paperclip/instances/default ~/paperclip-backup/instance-copy-pre-systemd
   ```

3. Find paths: `which pnpm node` (Rust is in `~/.cargo/bin`).
4. Create `~/.config/systemd/user/paperclip.service`, replacing the node
   directory and pnpm path:

   ```ini
   [Unit]
   Description=Paperclip (pnpm dev)
   After=network-online.target

   [Service]
   WorkingDirectory=%h/paperclip
   Environment=PATH=/path/to/node/bin:/home/peter/.cargo/bin:/usr/local/bin:/usr/bin:/bin
   ExecStart=/path/to/pnpm dev
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=default.target
   ```

5. Stop any terminal `pnpm dev` (Ctrl+C), then:

   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now paperclip
   sudo loginctl enable-linger $USER        # (you) sudo
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/health
   ```

   Expect `200` (allow a few minutes on first start).
6. **(you)** Stop the PC sleeping:

   ```bash
   sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
   ```

Under systemd, migrations apply without asking. Back up before any future
`git pull`.

## Phase 8 — Webhook-only Cloudflare tunnel

The install is `local_trusted`: any request reaching it is treated as the
board owner. The tunnel must forward only `/api/chat-webhooks/` and return
404 for everything else. Never route the whole hostname.

Replace `teams-hook.example.com` with the chosen hostname on a domain that is
on Cloudflare.

1. **(you)** Install cloudflared:

   ```bash
   sudo mkdir -p --mode=0755 /usr/share/keyrings
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt-get update && sudo apt-get install cloudflared
   ```

2. **(you)** `cloudflared tunnel login` (browser sign-in), then:

   ```bash
   cloudflared tunnel create paperclip-teams
   cloudflared tunnel route dns paperclip-teams teams-hook.example.com
   ```

3. Write `~/.cloudflared/config.yml` with the tunnel ID from `create`:

   ```yaml
   tunnel: <TUNNEL-ID>
   credentials-file: /home/peter/.cloudflared/<TUNNEL-ID>.json
   ingress:
     - hostname: teams-hook.example.com
       path: ^/api/chat-webhooks/
       service: http://localhost:3100
       originRequest:
         httpHostHeader: localhost
     - service: http_status:404
   ```

4. **(you)** Run it as a service:

   ```bash
   sudo cloudflared --config ~/.cloudflared/config.yml service install
   sudo systemctl enable --now cloudflared
   ```

5. Set the webhook origin and restart Paperclip:

   ```bash
   echo 'PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL=https://teams-hook.example.com' >> ~/.paperclip/instances/default/.env
   systemctl --user restart paperclip
   ```

6. Safety check. The first must print `404`; the second must return a JSON
   error from Paperclip:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://teams-hook.example.com/api/health
   curl -s -X POST https://teams-hook.example.com/api/chat-webhooks/probe/microsoft-teams
   ```

   If the first is not `404`, run `sudo systemctl stop cloudflared` and stop.

## Phase 9 — Microsoft setup (you)

Only the Comms Officer connects to Teams. Use the same Application (client)
ID everywhere.

1. **Admin check**: entra.microsoft.com → Identity → Users → your user →
   Assigned roles. Global Administrator, or ask whoever has it.
2. **Entra**: App registrations → New registration, "Paperclip Comms
   Officer", Single tenant. Copy Application (client) ID and Directory
   (tenant) ID. Certificates & secrets → New client secret, longest expiry,
   copy the **Value**. Calendar the expiry date.
3. **Azure Bot**: portal.azure.com → Create a resource → Azure Bot. F0,
   Single Tenant, Use existing app registration, both IDs.
4. **Connect Paperclip**: Connectors → Microsoft Teams → Chat with an agent →
   Comms Officer. Copy the messaging endpoint (should start
   `https://teams-hook.`). In Azure bot Settings → Configuration paste it;
   Settings → Channels add Microsoft Teams. Back in Paperclip, enter client
   ID, tenant ID, secret value; connect; Copy manifest settings.
5. **Developer Portal**: dev.teams.microsoft.com → Apps → New app "Comms
   Officer". App features → Bot: existing bot by Application ID; Personal,
   Team, Group chat; file upload on. Permissions: resource-specific
   Application permissions `ChannelMessage.Read.Group` and
   `ChatMessage.Read.Chat`. Compare with copied manifest settings; download
   the zip.
6. **Teams admin centre** (if uploads blocked): Org-wide app settings allow
   custom apps; Setup policies → Global → Upload custom apps on.
7. **Install**: Teams → Apps → Manage your apps → Upload a custom app → the
   zip → add to a personal chat. Send "hello", open the confirmation link on
   the PC, confirm. Optionally add the app to Paperclip HQ.
8. Notifier plugin settings → Agent Teams bots: `Comms Officer` → the
   Application (client) ID.

## Phase 10 — End-to-end test

| # | Do this | Expect |
|---|---------|--------|
| 1 | Ask an agent to raise a test confirmation on its task | "Your input is needed" card in Paperclip HQ with Who decides |
| 2 | Reply in Teams: `VIT-xx approved` | Officer confirms; card accepted in Paperclip |
| 3 | Second confirmation; reply `Refer VIT-xx to <agent>` | Officer confirms; new task for that agent |
| 4 | Send `Message for <agent>: test message` | Officer replies with a new task reference |
| 5 | Ask an agent to send you an update through the officer | "Message for you" card |
| 6 | Send `What's waiting for me?` | Short list of pending items |

For the first week, check agents mark money, contract and irreversible
decisions as Human only.
