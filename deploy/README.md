# Hosting

Octane runs on one AWS EC2 server at <https://octane.rishabhprajapati.me>.

| | |
|---|---|
| Server | `t3.medium`, Mumbai, Ubuntu 24.04, `13.232.70.181` |
| Website | `octane-web`, on port 3000 |
| Makers | `octane-maker@<name>`, on ports 8801 to 8808 |
| Indexer | `octane-indexer` |
| HTTPS | Caddy |

Only ports 80 and 443 are open to everyone. SSH opens to known addresses only. A phone hotspot can send SSH from a different address than the one websites report, so SSH may stay blocked there even after adding that address. Use a fixed network, or allow the carrier's range in the `octane-web` security group.

**The IP changes if the server is stopped,** because this account has no spare fixed IPs. A reboot keeps it. After a stop, update the `octane` CNAME and the address in `back-to-laptop.sh`.

## Connect

```bash
ssh -i ~/.ssh/octane-deploy.pem ubuntu@13.232.70.181
```

## Use the maker desk

**The desk is open to everyone while `DESK_PUBLIC=true` is in `deploy/hosted.env`.** That's for the live demo. Until it's closed, anyone can stop or restart any maker, change its rate, spend the test funds it borrows, or link their own wallet to a desk with no owner and withdraw that maker's earnings.

To close it after the demo, delete that line on the server and restart the website:

```bash
ssh -i ~/.ssh/octane-deploy.pem ubuntu@13.232.70.181 "sed -i '/^DESK_PUBLIC=/d' ~/octane/deploy/hosted.env && sudo systemctl restart octane-web"
```

Once it's closed, the owner reaches the desk over a private link, at <http://127.0.0.1:3000/makers/desk>:

```bash
ssh -i ~/.ssh/octane-deploy.pem -L 3000:127.0.0.1:3000 ubuntu@13.232.70.181
```

Stop `pnpm web` on the laptop first, because it uses the same port. Maker settings and Stop work as they do locally. A maker started with Go live won't restart itself after a crash, so press Go live again.

A new maker made here gets a public address by itself, from `OCTANE_PUBLIC_BASE` in the server's `.env`. Paymasters also need `contracts/out` on the server, which `git pull` doesn't bring: copy `OctanePaymaster.sol` and `OctanePaymasterFactory.sol` from the laptop's `contracts/out`.

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

If SSH is blocked, stop the whole server instead. This loses the journals written since the move, and gives the server a new IP when it next starts:

```bash
aws ec2 stop-instances --profile octane --region ap-south-1 --instance-ids i-0e73559ef969369bc
```

## Shut it down

Stop the server to stop the cost. To remove it for good, terminate the instance, delete the `octane-web` security group and the `octane-deploy` key pair, and delete the `octane` CNAME.
