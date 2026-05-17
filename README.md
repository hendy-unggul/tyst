# TYST

**Conversations that never happened.**

Anonymous ephemeral messaging — passing notes for the digital age.

→ [tyst.site](https://tyst.site) · [tyst.site/canary](https://tyst.site/canary) · [tyst.site/threat-model](https://tyst.site/threat-model)

---

## What TYST is

TYST is a **passing note system**, not a chat app.

Every message is:
- Encrypted on your device before it leaves
- Delivered through an anonymous relay
- Destroyed 5 seconds after the recipient reads it
- Gone from the server forever — no backup, no log

Only two people will ever know what was said: the sender and the recipient. And even that — only as long as they both remember.

---

## The Passing Note Model

Most secure messaging apps are secure chat apps. They protect message content but retain everything else: who talked to who, when, how often, for how long.

TYST is different by design.

```
CHAT MODEL:                   PASSING NOTE MODEL:
  Thread history    → stored    Thread history    → doesn't exist
  Message ordering  → stored    Message ordering  → doesn't exist
  Online indicator  → stored    Online indicator  → doesn't exist
  Typing indicator  → stored    Typing indicator  → doesn't exist
  Read receipts     → stored    Read receipts     → doesn't exist
  
  Every feature above =         Nothing to store =
  metadata on a server          nothing to compromise
```

Removing chat features is not a UX compromise. It is a security improvement.

**Every chat feature that doesn't exist is one attack surface that doesn't exist.**

---

## Why Passing Notes Are More Secure Than Chat

### 1. Per-message forward secrecy

Chat apps use per-session keys. If a session key is compromised, all messages in that session can be decrypted.

TYST generates a fresh ephemeral ECDH keypair for every single message. If one key is ever compromised, only that one message is affected. All others remain secure.

```
Chat:  session_key → message 1, 2, 3, 4, 5...
                     (one key, many messages)

TYST:  key_1 → message 1 (destroyed)
       key_2 → message 2 (destroyed)
       key_3 → message 3 (destroyed)
               (one key, one message, gone)
```

### 2. Minimal metadata

```
What TYST server knows:
  ✓ Two usernames communicated
  ✓ Approximate time (randomised 2–47s delay)
  ✓ Ciphertext blob (unreadable)
  
What TYST server does NOT know:
  ✗ Real identity of either party
  ✗ Message content
  ✗ Conversation frequency
  ✗ Online/offline status
  ✗ Message read time
  ✗ Anything about previous messages
     (they are destroyed)
```

### 3. Destruction is architecture, not feature

In chat apps, message deletion is a feature you have to use. History exists until you delete it.

In TYST, destruction is the default state. There is no concept of keeping a message. After 5 seconds, it is gone from the server permanently. No toggle. No option. No exceptions.

### 4. Zero identity correlation

TYST usernames are not linked to any real-world identity.

```
Signal:    username ← phone number ← SIM ← government ID
Telegram:  username ← phone number ← SIM ← government ID
WhatsApp:  username ← phone number ← SIM ← government ID

TYST:      username ← nothing
```

A TYST username is a name. Nothing more. No phone. No email. No device fingerprint. No IP log.

If you receive unwanted messages, abandon your username. Create a new one in 60 seconds. Your subscription transfers with you — one transfer code, instant, no repayment. Nothing follows you except what you choose to carry.

---

## Architecture

```
SENDER DEVICE                    SERVER (Helsinki, Finland)       RECIPIENT DEVICE
─────────────────                ──────────────────────────       ────────────────
1. Generate ephemeral            
   ECDH P-256 keypair            
   (single use, discarded)       
                                 
2. Fetch recipient pubkey   →    Return pubkey JWK           
                                 
3. ECDH(eph_priv, rec_pub)       
   → shared secret               
   HKDF-SHA256                   
   → AES-256 key                 
                                 
4. Pad to 256-byte block         
   (size does not leak)          
                                 
5. AES-GCM encrypt               
   (random 12-byte IV)           
                                 
6. Random delay 2–47s       →    Store ciphertext only        
   (timing obfuscation)          (cannot decrypt)             
                                 Strip identifying headers     
                                 before forwarding            
                                                              →  7. Recipient fetches inbox
                                                                 
                                                                 8. ECDH(rec_priv, eph_pub)
                                                                    → same shared secret
                                                                    HKDF → same AES key
                                                                 
                                                                 9. AES-GCM decrypt
                                                                    Unpad → plaintext
                                                                 
                                 10. destroy_at = read + 5s   
                                     Permanent deletion        
                                     No backup. No log.        
```

---

## Protocol

```
Key exchange:    ECDH P-256  (ephemeral — new keypair every message)
Encryption:      AES-GCM 256-bit
Key derivation:  HKDF-SHA256 (salt: 32 zero bytes · info: "whisper-v2")
Padding:         256-byte blocks (message size does not leak)
IV:              12-byte random (crypto.getRandomValues)
Delay:           2–47 seconds random (timing correlation prevention)
Destruction:     5 seconds post-read (server-side, permanent)
```

Wire format: `base64(iv):base64(ephemeral_pubkey_jwk):base64(ciphertext)`

---

## Crypto source

The complete cryptographic engine is published as a standalone, zero-dependency library:

**[github.com/hendy-unggul/tyst-crypto](https://github.com/hendy-unggul/tyst-crypto)**

```
crypto.js        — complete implementation, 193 lines
crypto.test.js   — 10 test vectors, run in browser console
README.md        — protocol documentation
SECURITY.md      — responsible disclosure policy
```

Verify it yourself. Run the tests. The security guarantee is verifiable from the source code alone — without trusting us.

---

## Access model

```
FREE ACCOUNT (always free):
  Register username + PIN
  No phone. No email. No ID.
  60 seconds.
  Can SEND messages to any TYST user.

INBOX — $1/year (founding: first 5,000):
  Can SEND and RECEIVE messages.
  Full inbox with self-destruct.
  Price locked forever at $1/year.

INBOX — $3/year (standard, after 5,000):
  Same as founding.
  Standard price after founding slots filled.
```

**Send is always free. Inbox is $1–3/year.**

Guest send is not supported. All senders must have a free TYST account. This is intentional — a free account costs 60 seconds to create, which is enough friction to make spam economically worthless, while adding zero real-world identity requirements.

---


## How trust works

TYST separates distribution from identity into two distinct layers.

**Layer 1 — Public (TYST handles this):**

Anyone can share a TYST link or QR code freely — via WhatsApp, Twitter, a billboard, a business card, anywhere. Every link and QR code is identical. They point to the app. Nothing more. No username. No identity. No trace of who shared it.

The wider it spreads, the better. Distribution has no privacy cost.

**Layer 2 — Private (humans handle this):**

Username exchange happens outside TYST — face to face, on paper, through a trusted channel, however two people choose. TYST does not facilitate this. TYST does not need to know. TYST cannot know.

```
"username saya: over.joy"
— said in person, written on paper,
  sent via Signal, or whispered.
  
TYST has no record of this exchange.
No server does.
```

This is not a limitation. It is the architecture.

**Why this wall is strong:**

To read someone's messages, an attacker must break both layers simultaneously:

```
Layer 1:  nothing to extract — QR encodes only tyst.site/app
Layer 2:  outside all technology — no server, no subpoena,
          no jurisdiction covers a conversation that
          was never digitized
Layer 3:  ciphertext only on server — unreadable without
          recipient's private key
Layer 4:  message destroyed 5 seconds after reading —
          nothing left to seize
```

The strongest encryption is a secret that was never digitized. TYST encrypts what is digital. Layer 2 protects what never was.

> **Share the door, not the key.**
> The door is public. The key is yours.

## Subscription portability

A TYST subscription is not tied to a username. It is tied to you.

If you need to abandon a username — because of unwanted messages, or simply because you want a fresh start — your subscription moves with you:

```
1. Settings → "transfer subscription"
2. System generates a one-time transfer code
3. Register new username
4. Enter transfer code → subscription transfers instantly
5. Old username expires
6. New username inherits remaining subscription period
```

No repayment. No support ticket. No identity verification.
Your subscription follows you the same way your private key does — silently, on your terms.

---

## Sender controls

Senders can choose to include or omit their username:

```
[ ] include my username (optional)

Unchecked (default): message arrives as anonymous
Checked: recipient sees your username, can mute or block
```

Recipients can mute or block usernames silently. Blocked senders receive no notification — the server silently accepts and discards their messages.

---

## Infrastructure

```
Hosting:      Hetzner Helsinki HEL1 · AS24940 · Finland
Jurisdiction: Finnish law · EU GDPR · not Five Eyes
Database:     Pocketbase (self-hosted) · SQLite · no external service
Reverse proxy: Caddy · auto-renewed TLS
CDN/Shield:   Cloudflare (edge, DDoS protection)
Payment:      BTCPay Server (self-hosted) · BTC · Lightning · XMR
```

---

## Sustainability

TYST is not venture-backed. It does not depend on token economics, node operators, or recurring fundraising rounds.

```
Monthly infrastructure cost:  $6.50
Break even:                   2 paying users/year
Founding 5,000 @ $1/year:     $5,000 — covers infrastructure for 10 years
Post-5,000 @ $3/year:         pure profit → formal audit → better infrastructure
```

This is not a company optimising for growth. It is a tool optimising for longevity.

---


## Why sustainability matters for a privacy tool

Most privacy apps have a structural problem: they are free to use, expensive to run, and dependent on either venture capital or community donations.

This creates a hidden threat that no encryption can protect against.

```
VC-backed app:
  Investor patience runs out
  → Monetise user data
  → Or sell to acquirer
  → Or shut down
  
  Every VC-backed privacy app
  is one board meeting away from
  becoming the thing it promised
  to protect you from.

Donation-dependent app:
  Donor fatigue after round 2-3
  → Skeleton crew
  → Reduced maintenance
  → Security vulnerabilities unpatched
  → Or: shut down
  
  Session asked for $1M or close.
  They had 5 million users.
  Donations did not save them.
```

TYST is built on a different premise entirely.

```
TYST financial structure:

  Monthly cost:      $6.50
  Revenue needed:    2 users/year at $3
  
  Founding 5,000 @ $1/year:
    $5,000 revenue
    $750 infrastructure × 10 years
    $4,250 remaining for audit + development
    Zero dependency on anyone
    
  Post-5,000 @ $3/year:
    Pure profit
    No investors to answer to
    No donors to thank
    No token price to maintain
    No node operators to incentivise
    
    Every decision made on one criterion:
    "Is this good for users?"
```

The $1/year founding price is not charity. It is a value exchange: you get a permanent inbox at a locked price, we get 10 years of financial independence.

No one can pressure TYST to add tracking, weaken encryption, or hand over data — because no one has leverage. There is no investor waiting for an exit. There is no donor expecting influence. There is no token that needs to pump.

**The architecture is simple because the business model is simple. And the business model is simple because the tool does one thing and charges a fair price for it.**

This is not a feature. It is a structural guarantee that no technical architecture alone can provide.

```
SimpleX:   technically impressive · VC money · uncertain future
Session:   technically sound · token model · closing July 2026
Signal:    excellent · grant-dependent · one funding crisis away
Threema:   paid upfront · profitable · closest to TYST model

TYST:      $6.50/month · $1-3/year · 2 users to break even
           10 years funded by 5,000 founding members
           No one owns us. No one can.
```

---

## Warrant canary

[tyst.site/canary](https://tyst.site/canary) — updated monthly.

If the canary page stops updating, assume compromise.

---

## Threat model

[tyst.site/threat-model](https://tyst.site/threat-model)

Honest documentation of what TYST protects against — and what it does not.

---

## Known limitations

- **Device compromise** — private key stored in localStorage. Device access = key access.
- **Recipient betrayal** — recipient can screenshot before destruction.
- **Network surveillance** — TYST encrypts content, not the fact that you used TYST. Use Tor.
- **Centralised relay** — single server in Finland. Mitigated by warrant canary and Finnish jurisdiction.
- **No formal audit** — crypto is open source and community-reviewed. Formal audit is planned after sufficient revenue.
- **Not post-quantum** — ECDH P-256 is not quantum-resistant.

---

## Security

Responsible disclosure: **security@tyst.site**

See [SECURITY.md](https://github.com/hendy-unggul/tyst-crypto/blob/main/SECURITY.md) in the tyst-crypto repo.

---

## License

MIT

---

*"Conversations that never happened. Only you and them will know. And even that — only as long as you both remember."*
