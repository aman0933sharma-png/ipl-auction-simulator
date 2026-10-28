# IPL Auction

Live auction game for 2–10 owners on different phones. Three auction types: Cricket, Cars, Bikes.

1. Make a profile (name + password, 6+ characters) or log in.
2. One person creates a room code (or hits Random) and picks the auction type.
3. The other phones open the same site, choose **Code se join**, and enter that code.
4. When everyone shows in the lobby, the host presses **Start auction**.
5. Each phone bids only for its own team. A bid resets the lot clock; passing does not.
   When the clock hits 0 (or everyone except the leader passes) the lot is sold or goes unsold.
   The host can also close a lot early with **Host: Sold** / **Host: Unsold**.

Current rules (from `src/lib/auction/catalog.ts`):

| Type    | Purse   | Bid step | Squad cap                                   | Overseas cap | Clock per bid |
| ------- | ------- | -------- | ------------------------------------------- | ------------ | ------------- |
| Cricket | ₹250 Cr | ₹0.50 Cr | 15 per format (Test, ODI, T20), so up to 45 | none         | 15 s          |
| Cars    | ₹50 Cr  | ₹0.50 Cr | 15 cars                                     | none         | 10 s          |
| Bikes   | ₹25 Cr  | ₹0.02 Cr | 5 bikes                                     | none         | 10 s          |

Both phones must open the deployed site, not a raw HTML file.
