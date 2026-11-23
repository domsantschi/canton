# Private auction ledger model

Build and run with Daml SDK 3.4.11: `dpm build` and `dpm test` (or
`daml build` and `daml test` with that SDK). Tests use the Daml Script
in-memory ledger; no Canton network is required.

## Contract API

1. The auctioneer creates `AuctionSetup(auctioneer, bidder1, bidder2, bidder3,
   title)` and exercises `Open`. The three bidders must be distinct from each
   other and the auctioneer. `Open` returns `OpenedAuction` with the `auction`
   liveness marker, seller-private `sale`, and three ordered `invite1..3` IDs.
2. Each invited bidder exercises their own `Invitation.SubmitBid(amount)` once.
   The amount must be positive. The resulting `Bid` is jointly signed by the
   auctioneer and bidder; it is not consumed at closing. Submission fetches the
   active liveness marker, so it cannot succeed once the auction is closed.
   Neither bidder nor auctioneer alone can archive the jointly signed bid.
3. The auctioneer exercises `Auction.Close(bid1, bid2, bid3)`, supplying the
   three respective active bids. Close verifies their exact invitation, bidder,
   auction, and auctioneer; all three bids are required. The greatest amount
   wins; ties go to the earliest numbered invitation. Close archives the marker,
   creates one `Obligation` for the winner and one `Loss` for each loser, and
   returns unit. Each auction has independent IDs and can be closed only once.
4. The auctioneer can issue `Credit(issuer, owner, amount)` as ledger credit.
   The winner exercises `Obligation.Pay(credit)` using one sufficient credit
   issued by that auctioneer. It consumes the obligation and credit, transfers
   exactly the bid to an auctioneer-owned credit, returns any change to the
   winner, and creates a `Payment` receipt. `Credit.Transfer(recipient, quantity)`
   also lets its owner transfer/split a credit. All amounts are positive Decimal.

## Privacy and trust

The shared `AuctionOpen` contains only the title and invited parties. Its
argument-free `Archive` is the only shared close event; the `Close` exercise,
its bid IDs and computations are visible only to the auctioneer. Each bid is
visible only to its bidder and the auctioneer before and after closing. Each
loser sees only their own `Loss`, not the winner, winning amount, obligation,
payment or other bids. The winner sees their own obligation/payment. Outsiders
are not stakeholders. Child actions of the private close are individually
visible to their own stakeholders. As usual, parties with separately acquired
information can share it off-ledger, and infrastructure operators/hosting
arrangements must enforce the ledger's privacy model.

`Credit` is real on-ledger, issuer-backed book credit, not a transfer of bank
money, Canton Coin, or an externally redeemable asset. The auctioneer is trusted
to issue and redeem it; they can mint credits, so supply is not capped. Funding,
redemption, default enforcement and external cash settlement are outside this
model. Payment requires a single sufficiently large credit (credits cannot be
combined in `Pay`). A winner can decline to pay; the obligation remains active.
The auctioneer is trusted to operate the auction honestly and retain its IDs;
as with any Daml template, authorized parties may create other contracts or
exercise the built-in `Archive` choice. Extra invitations do not count toward
closing, which checks the original three invitation IDs.

The scripts assert contract visibility and the close transaction's event
structure. They do not independently query party-filtered historical event
streams; verify those against the deployed Canton participant as an integration
test.
