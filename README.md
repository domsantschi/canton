# Private auction on Canton LocalNet

This is a local demonstration, not a production application. It runs Daml
contracts on the app-provider participant and queries the JSON Ledger API.
The auctioneer invites Alice, Bob and Carol; an outsider is available for
privacy checks. Multiple auctions can be open at once.

## Prerequisites

- Docker Desktop with Linux containers, Compose, and approximately 8 GB of
  memory available to Docker.
- Node.js 18 or newer.
- Daml SDK 3.4.11 and a compatible Java runtime. Install DPM using the
  [official instructions](https://docs.canton.network/sdks-tools/cli-tools/dpm.md),
  then run `dpm install 3.4.11`.

## Start

From this directory in PowerShell:

```powershell
.\scripts\localnet.ps1 -Action start
dpm build
npm start
```

The first command downloads the pinned Canton QuickStart and starts LocalNet
and its app-provider PQS. It may take several minutes. It uses port 55432
for LocalNet PostgreSQL to avoid an existing PostgreSQL on port 5432.
Check with `.\scripts\localnet.ps1 -Action status` and
`.\scripts\localnet.ps1 -Action logs`. The JSON Ledger API should answer
`http://localhost:3975/readyz` before connecting the app.

Open `http://localhost:3001` and select **Connect / retry setup**. Setup uploads
the built DAR and allocates five distinct parties with separate Ledger API
users. Existing demo users are reused only if their rights remain isolated.

If startup is interrupted, run the start command again; it preserves the
LocalNet database. If `splice` remains in `health: starting`, inspect
`docker logs --tail 100 splice` and `docker logs --tail 100 canton`. On the
initial machine, the super-validator was still loading packages and Scan was
waiting for its primary party; the validator API returned 503. Docker had
about 7.2 GiB available, below the recommended 8 GiB. If startup continues to
stall, check Docker/WSL resource allocation before retrying. Do not remove
Docker volumes unless you intend to erase LocalNet data.

## Demonstration

1. As the auctioneer, choose the three named bidders and open an auction.
   Copy the sale and invitation IDs if you want to test unauthorized actions.
2. Switch to each bidder and submit one positive bid. Check each bidder's
   active contracts: only their own bid is visible. The outsider's view is
   empty.
3. Before closing, try submitting an invitation as the outsider, closing as a
   bidder, and the bid-tampering action with another bidder's bid ID. Each
   should be rejected. Tampering attempts to archive the bid; the ledger
   requires its signatories.
4. As auctioneer, close the sale with its three bids in invitation order.
   The highest bidder wins; ties go to the earlier invitation. Switch through
   the participants again: each bidder retains only their own bid, the winner
   sees an obligation, and each loser sees a loss. The outsider still sees no
   auction data. Try bidding again with a saved invitation ID.
5. As auctioneer, issue credit to the winner. Switch to the winner and pay the
   obligation with that credit. The exact bid amount is transferred, and any
   remainder is returned as credit.

Contract IDs can be pasted into the action fields. The log and browser are
shared by this local operator, so clear the log between perspectives.

## Tests

```powershell
dpm test
npm test
$env:LIVE_LEDGER_TEST = '1'
npm test
```

The final command requires a ready LocalNet; it deploys the DAR and runs a
fresh auction against the live participant.

## Privacy and payment limitations

The app is a **single-operator demo**: the server holds the LocalNet shared
secret and can impersonate all five users. Switching identities is not login,
and the unsafe development JWT secret is public. Do not expose this service
or LocalNet to an untrusted network. The party-filtered views demonstrate
ledger visibility, not protection from the demo operator or a participant
administrator.

Bids are visible to their bidder and auctioneer, not other bidders. Each loss
is private to its bidder and the auctioneer. The auctioneer can always share
information off-ledger. Credit is an auctioneer-issued on-ledger asset, not
Canton Coin or bank money; it is not backed by external funds. Paying requires
the winner to submit the payment choice. See [the model](daml/README.md) for
the contract and trust details.

PQS is started as requested but is **not** the app's read path. Its QuickStart
configuration initially reads the QuickStart app-provider party, not the five
demo parties. A shared PQS database is not a per-user authorization boundary;
do not expose it directly to bidders. The app uses separate Ledger API users
and explicit party filters instead.
