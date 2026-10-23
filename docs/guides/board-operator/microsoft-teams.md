---
title: Microsoft Teams
summary: Run Paperclip so people can talk to agents from Microsoft Teams
---

Paperclip's experimental chat connector binds one Microsoft Teams bot to one
Paperclip agent. Each admitted Teams conversation (personal chat, group chat,
or standard team channel) becomes a Paperclip task. The agent replies,
asks questions, and posts progress back into the same conversation.

<Warning>
The Teams connector is experimental and has not yet been qualified against a
live Microsoft 365 tenant upstream. Pilot it with a small group before relying
on it, and keep approvals and spend decisions on the Paperclip board.
</Warning>

## What you need

- A Microsoft 365 work or school tenant (not a personal teams.live.com
  account) where you can register Entra applications.
- An Azure subscription where you can create an Azure Bot (the F0 free tier
  is enough).
- Permission to upload custom Teams apps, or a Teams administrator who will
  approve the app.
- A stable public HTTPS hostname for Paperclip. The bundled compose file uses
  a Cloudflare named tunnel, so you need a domain on Cloudflare. Quick
  `trycloudflare.com` tunnels change hostname on restart and break the bot.
- Docker with Compose (or an existing install; see the home PC alternative
  below), and at least one model provider key.

## 1. Run Paperclip with a public HTTPS URL

1. In Cloudflare Zero Trust, open **Networks → Tunnels**, create a tunnel, and
   copy its token. Add a public hostname (for example
   `paperclip.example.com`) routed to `http://paperclip:3100`.
2. Configure and start Paperclip:

   ```sh
   cd docker
   cp .env.teams.example .env
   # Fill in PAPERCLIP_PUBLIC_URL, CLOUDFLARE_TUNNEL_TOKEN, both secrets
   # (openssl rand -hex 32 for each) and a model provider key.
   docker compose -f docker-compose.teams.yml up -d --build
   ```

3. Open your public URL straight away and sign up. The first account becomes
   the instance admin, so do this before anyone else can reach the page.
4. Set `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` in `docker/.env` and run the
   `up -d` command again. Add colleagues through the invite flow.
5. Check health: `curl -sf https://paperclip.example.com/api/health`.

Using your own reverse proxy instead of Cloudflare is fine: drop the `tunnel`
service, terminate TLS in the proxy, and point it at port 3100. To keep the
board private and expose only provider webhooks, see
[Webhook-only chat ingress](/deploy/environment-variables#webhook-only-chat-ingress).

### Alternative: existing install on a home PC (Ubuntu, no Docker)

If Paperclip already runs on your own machine (for example via
`npx paperclipai run` on `http://localhost:3100`), keep the board private and
publish only the chat webhook path through a Cloudflare tunnel. Microsoft can
then reach the bot, but nobody on the internet can reach the board.

<Warning>
A default local install runs in `local_trusted` mode, where any request that
reaches Paperclip is treated as the board owner. The tunnel must forward only
`/api/chat-webhooks/` and return 404 for everything else. Never route a
whole hostname to a `local_trusted` board.
</Warning>

1. Install `cloudflared` from Cloudflare's apt repository, then create a named
   tunnel and DNS record:

   ```sh
   cloudflared tunnel login
   cloudflared tunnel create paperclip-teams
   cloudflared tunnel route dns paperclip-teams teams-hook.example.com
   ```

2. Write `~/.cloudflared/config.yml` (use the tunnel ID printed by `create`):

   ```yaml
   tunnel: <TUNNEL-ID>
   credentials-file: /home/<you>/.cloudflared/<TUNNEL-ID>.json
   ingress:
     - hostname: teams-hook.example.com
       path: ^/api/chat-webhooks/
       service: http://localhost:3100
       originRequest:
         # Paperclip's private hostname guard accepts loopback hosts only.
         httpHostHeader: localhost
     - service: http_status:404
   ```

3. Run it as a system service so it starts at boot:

   ```sh
   sudo cloudflared --config ~/.cloudflared/config.yml service install
   sudo systemctl enable --now cloudflared
   ```

4. Tell Paperclip the webhook origin and restart Paperclip:

   ```sh
   echo 'PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL=https://teams-hook.example.com' \
     >> ~/.paperclip/instances/default/.env
   ```

5. Check that only the webhook path is exposed. The first request should get
   Cloudflare's 404; the second should return a JSON error from Paperclip,
   which is expected because the request is unsigned:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://teams-hook.example.com/api/health
   curl -s -X POST https://teams-hook.example.com/api/chat-webhooks/probe/microsoft-teams
   ```

6. Stop the PC from sleeping, or the bot goes silent:

   ```sh
   sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
   ```

With a private board, Teams messages carry no clickable task links, and you
open account-confirmation links in a browser on the same PC (or over
Tailscale). Make sure Paperclip itself restarts after a reboot, for example
with a systemd service.

## 2. Turn on chat connectors

In Paperclip, open **Company settings → Instance → Experimental** and enable
**Chat connectors**. Create a company and the agent you want people to talk
to if you have not already.

## 3. Start the Teams connection

Open **Connectors** in the sidebar, choose **Microsoft Teams → Chat with an
agent**, and pick the agent. The setup screen shows the **Paperclip messaging endpoint**. Keep this
screen open; you will paste values into it in step 5.

If the messaging endpoint is missing, `PAPERCLIP_PUBLIC_URL` is not a public
HTTPS URL. Fix it and restart.

## 4. Create the Microsoft side

Use the same Application (client) ID in all three places.

1. Microsoft Entra admin center → **App registrations → New registration**.
   Choose **Single tenant** and register. Copy the **Application (client) ID**
   and **Directory (tenant) ID**. Under **Certificates & secrets**, create a
   client secret and copy its **Value** (not the Secret ID). Note its expiry
   date: the bot stops working when it expires.
2. Azure portal → **Create Azure Bot**. Set **Type of App** to **Single
   Tenant** and **Creation type** to **Use existing app registration**, then
   enter the IDs above. After creation, open **Settings → Configuration**, paste
   the Paperclip messaging endpoint, and save. Open **Settings → Channels** and
   add **Microsoft Teams**.
3. Teams Developer Portal → **Apps → New app**. Under **App features → Bot**,
   select the existing bot by its Application ID and enable the **Personal**,
   **Team**, and **Group chat** scopes and file support. Under **Permissions**,
   add the two resource-specific **Application** permissions shown on the
   Paperclip setup screen (`ChannelMessage.Read.Group`,
   `ChatMessage.Read.Chat`). Compare your manifest with the block Paperclip
   shows (**Copy manifest settings**), fill in app details and icons, and
   download the app package.

## 5. Connect and install

1. Back in Paperclip, enter the client ID, tenant ID, and client secret value,
   then connect.
2. In Teams, open **Apps → Manage your apps → Upload an app → Upload a custom
   app** and choose the package. Install it in a personal chat first, then in
   the group chats or teams you want. If upload is blocked, ask a Teams
   administrator to allow or publish the app.

## 6. Link people and set reach

- Message the bot in a personal chat. Each person must link their Teams
  account to their Paperclip account: follow the private confirmation link the
  bot sends, or generate one from the connection's **People** section in
  Paperclip and send it to that person. They sign in and confirm it
  themselves. Linked people act with their own Paperclip permissions.
- On the connection's page in Paperclip, choose whether direct messages,
  group chats, and channels are allowed, and whether an @mention is required.
- Useful commands in Teams: `/status`, `/new`, `/close`.

## Limits in this release

- Private and shared channels are not supported.
- Files sent from Paperclip arrive as task links. Native file receipt works in
  personal chats only.
- Board comments stay internal unless you explicitly send them to the chat.
  Raw reasoning, logs, and credentials are never sent.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Bot never replies | Azure Bot messaging endpoint matches the Paperclip value exactly; the tunnel is up; the connection is active in Paperclip. |
| `401`/auth errors in connection activity | Client secret value (not ID), tenant ID, and single-tenant settings match across Entra and Azure Bot. |
| Bot ignores group or channel messages | Reach toggles on the connection page; RSC permissions present in the app package; app installed in that team or chat. |
| Links in Teams say "open the task in Paperclip" | `PAPERCLIP_PUBLIC_URL` is not a public HTTPS URL. |
| Stopped working after months | Client secret expired. Create a new one and use **Reconnect**. |
