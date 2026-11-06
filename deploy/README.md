# Hosting

Octane runs on one AWS EC2 server at <https://octane.rishabhprajapati.me>.

| | |
|---|---|
| Server | `t3.medium`, Mumbai, Ubuntu 24.04, `13.232.70.181` |
| Website | `octane-web`, on port 3000 |
| Makers | `octane-maker@<name>`, on ports 8801 to 8808 |
| Indexer | `octane-indexer` |
| HTTPS | Caddy, which also blocks `/api/desk` for the public |

Only ports 80 and 443 are open to everyone. SSH opens to known addresses only.

**The IP changes if the server is stopped,** because this account has no spare fixed IPs. A reboot keeps it. After a stop, update the `octane` CNAME and the address in `back-to-laptop.sh`.

## Connect

```bash
ssh -i ~/.ssh/octane-deploy.pem ubuntu@13.232.70.181
```

## Use the maker desk

The desk can start and stop makers, so the public can't reach it. Open a private link, then visit <http://127.0.0.1:3000/makers/desk>:

```bash
ssh -i ~/.ssh/octane-deploy.pem -L 3000:127.0.0.1:3000 ubuntu@13.232.70.181
```

Stop `pnpm web` on the laptop first, because it uses the same port. Maker settings and Stop work as they do locally. A maker started with Go live won't restart itself after a crash, so press Go live again.

A new maker made here also needs a route in `Caddyfile` and a `MAKER_<NAME>_PUBLIC_ENDPOINT` in the server's `.env`, or payers can't reach it.

## Day to day

```bash
systemctl status octane-maker@cautious
journalctl -u octane-maker@cautious -f
sudo systemctl restart octane-web
```

After changing `.env`, restart the services that use it. Copy it with `ssh ... 'umask 077; cat > ~/octane/.env' < .env`, then run `cat ~/octane/deploy/hosted.env >> ~/octane/.env`, so makers started from the desk keep their public addresses.

A crashed maker restarts within 5 seconds, and a reboot brings everything back. Use `sudo systemctl stop octane-maker@<name>` to keep one offline.

## Back to the laptop

```bash
./deploy/back-to-laptop.sh
```

It stops the makers on the server, copies their data back and switches to `main`. Never run the same maker in two places: both would write as the same wallet.

## Shut it down

Stop the server to stop the cost. To remove it for good, terminate the instance, delete the `octane-web` security group and the `octane-deploy` key pair, and delete the `octane` CNAME.
