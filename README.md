# Foundit 🔍

> An AI-powered lost & found platform for university campuses — with blockchain-verified handovers and token rewards for finders.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black?logo=next.js)](https://nextjs.org)
[![Solidity](https://img.shields.io/badge/Contracts-Solidity%200.8.20-363636?logo=solidity)](https://soliditylang.org)
[![Sepolia](https://img.shields.io/badge/Network-Sepolia%20Testnet-6f42c1)](https://sepolia.etherscan.io)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ecf8e?logo=supabase)](https://supabase.com)

---

## What is Foundit?

Foundit solves a real campus problem: the traditional lost & found is a clipboard on a wall that nobody checks. Foundit replaces it with:

- **AI semantic matching** — describe or photograph what you lost; the system scans every found item using vector embeddings, not just keywords
- **Direct messaging** — contact the finder immediately, no admin middleman
- **Blockchain handover proof** — the exchange is recorded on-chain via a keccak256-hashed secret code shared in person, preventing fraud
- **FNDT reward tokens** — finders earn diminishing-reward tokens (10 → 8 → 5 → 3 → 1) for each successful return
- **Email notifications** — instant Resend emails when a match is found, when you get a message, or when a claim moves through the pipeline

---

## Live Contracts (Sepolia Testnet)

| Contract | Address | Source |
|----------|---------|--------|
| **HandoverRegistry** | `0x55cbf1F8024dcc09f5F0Ce6347283B754De94d5F` | [Sourcify ↗](https://repo.sourcify.dev/contracts/full_match/11155111/0x55cbf1F8024dcc09f5F0Ce6347283B754De94d5F/) |
| **FinderRewardToken (FNDT)** | `0xdeE6F61a48D1b1553F183526a59C7addEed62C8f` | [Sourcify ↗](https://repo.sourcify.dev/contracts/full_match/11155111/0xdeE6F61a48D1b1553F183526a59C7addEed62C8f/) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 16 Frontend                  │
│  Clerk Auth │ Item Feed │ AI Matches │ Messages │ Claims│
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                   FastAPI Backend                       │
│  /items  /matches  /messages  /claims  /auth  /admin    │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ HuggingFace  │  │    Resend    │  │  eth-hash     │  │
│  │ BAAI Embeds  │  │   Emails     │  │  keccak256    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Supabase (PostgreSQL)                  │
│  pgvector (512-dim embeddings) │ Storage │ RLS Policies │
└─────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Sepolia Testnet (Ethereum)                 │
│  HandoverRegistry.sol │ FinderRewardToken.sol (ERC-20)  │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Vanilla CSS |
| Auth | Clerk (RS256 JWT, JWKS verified) |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Database | Supabase (PostgreSQL + pgvector) |
| AI Matching | HuggingFace `BAAI/bge-small-en-v1.5` (384-dim → padded to 512) |
| File Storage | Supabase Storage |
| Email | Resend |
| Smart Contracts | Solidity 0.8.20, Hardhat, OpenZeppelin |
| Blockchain | Sepolia Testnet via Infura |
| Wallet | MetaMask (ethers.js v6) |
| Verification | Sourcify (decentralised, no API key needed) |

---

## Claim Flow

```
1. Owner posts lost item  ──► AI auto-matches against found items
                               └─► Email: "Match found!" to both owners

2. Owner messages finder  ──► They agree to meet

3. Owner clicks "Initiate Claim"
   ├─► Backend generates 6-char secret code (e.g. "B7KP3M")
   ├─► Backend stores keccak256(secret) — raw code never saved
   ├─► [Optional] HandoverRegistry.initiateClaim() called on-chain
   └─► Email: "Claim needs approval" → Admin

4. Admin reviews & approves in /admin
   └─► Email: "Claim approved — collect now!" → Finder

5. Finder enters secret code (shared in person)
   ├─► Backend verifies keccak256(input) == stored hash
   ├─► [Optional] HandoverRegistry.completeClaim() called on-chain
   ├─► FNDT tokens minted to finder's wallet
   ├─► Item marked "closed" (removed from public feed)
   └─► Email: "Item returned!" → Owner
```

### Anti-fraud mechanisms
- Admin must approve before completion in the backend (prevents FNDT token farming).
- Blockchain claim completion is trustless and doesn't require admin multi-sig.
- Secret shared **in person only** (prevents remote fraud).
- On-chain key = `keccak256(claimId, ownerWallet)` — binds claim to owner's address, preventing front-running.
- 24-hour claim expiry enforced on both backend and contract.
- Diminishing rewards: first find = 10 FNDT, subsequent = 8, 5, 3, 1.

---

## Project Structure

```
foundit/
├── frontend/                    # Next.js 16 app
│   └── src/
│       ├── app/
│       │   ├── page.tsx         # Homepage with live stats
│       │   ├── items/           # Browse + item detail
│       │   ├── my-items/        # User's own items
│       │   ├── matches/         # AI matches dashboard
│       │   ├── messages/        # Messaging (5s polling)
│       │   ├── report/          # Post lost/found item
│       │   ├── profile/         # User profile + FNDT balance
│       │   └── admin/           # Claim approval dashboard
│       ├── components/
│       │   ├── ClaimModal.tsx   # Full blockchain claim flow
│       │   ├── MessageModal.tsx # Quick-message overlay
│       │   ├── MatchCard.tsx    # AI similarity ring UI
│       │   └── Navbar.tsx       # With unread message badge
│       └── lib/
│           ├── api.ts           # Axios + Clerk JWT injection
│           └── blockchain.ts    # ethers.js contract helpers
│
├── backend/                     # FastAPI Python app
│   ├── routers/
│   │   ├── items.py             # CRUD + embedding on upload
│   │   ├── matches.py           # AI match retrieval
│   │   ├── messages.py          # DM system + email hook
│   │   ├── claims.py            # Blockchain claim lifecycle
│   │   ├── auth.py              # Clerk JWT → user profile sync
│   │   └── admin.py             # Stats + claim management
│   ├── services/
│   │   ├── clip_service.py      # HuggingFace embedding API
│   │   ├── match_engine.py      # pgvector RPC + Python fallback
│   │   ├── email_service.py     # Resend notifications
│   │   └── storage_service.py  # Supabase file upload
│   ├── make_admin.py            # CLI: promote user to admin
│   └── .env.example
│
├── blockchain/                  # Hardhat project
│   ├── contracts/
│   │   ├── HandoverRegistry.sol # Claim + secret verification
│   │   └── FinderRewardToken.sol# ERC-20 FNDT token
│   └── scripts/deploy.ts
│
└── supabase/
    └── migrations/              # 10 versioned SQL migrations
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+
- A [Supabase](https://supabase.com) project with pgvector enabled
- A [Clerk](https://clerk.com) application
- A [HuggingFace](https://huggingface.co) account (free tier works)
- A [Resend](https://resend.com) account for emails (optional)
- MetaMask browser extension (optional, for blockchain features)

---

### 1. Database Setup

Run the migrations in order against your Supabase project:

```bash
# Via Supabase CLI
supabase db push

# Or manually in Supabase SQL editor — run each file in supabase/migrations/ in order
```

---

### 2. Backend

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your values (see Environment Variables section below)

# Start the API server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Clerk publishable key and backend URL

# Start dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

---

### 4. Smart Contracts (Optional)

Only needed if you want to deploy your own contracts. The live Sepolia contracts work out of the box.

```bash
cd blockchain

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add your PRIVATE_KEY and SEPOLIA_RPC_URL

# Compile
npx hardhat compile

# Deploy to Sepolia
npx hardhat run scripts/deploy.ts --network sepolia

# Verify on Sourcify (no API key needed)
npx hardhat verify --network sepolia <FNDT_ADDRESS> <REGISTRY_ADDRESS>
npx hardhat verify --network sepolia <REGISTRY_ADDRESS> <FNDT_ADDRESS>
```

Copy the deployed addresses to `backend/.env`.

---

## Environment Variables

### `backend/.env`

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# Clerk authentication
CLERK_ISSUER=https://your-app.clerk.accounts.dev
# For local dev only — remove in production:
# CLERK_JWT_INSECURE_NO_VERIFY=true

# AI embeddings
HUGGINGFACE_API_KEY=hf_...

# Email notifications (optional)
RESEND_API_KEY=re_...

# Server
FRONTEND_URL=http://localhost:3000
API_HOST=0.0.0.0
API_PORT=8000

# Blockchain (Sepolia) — use the live addresses or deploy your own
REWARD_TOKEN_ADDRESS=0xdeE6F61a48D1b1553F183526a59C7addEed62C8f
HANDOVER_REGISTRY_ADDRESS=0x55cbf1F8024dcc09f5F0Ce6347283B754De94d5F
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### `blockchain/.env`

```env
PRIVATE_KEY=your_metamask_deployer_private_key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_key
ETHERSCAN_API_KEY=your_etherscan_api_key   # optional, for Etherscan badge
```

---

## Admin Access

After signing up, promote your account to admin using the CLI:

```bash
cd backend
source .venv/bin/activate
python make_admin.py your@email.com

# List all admins
python make_admin.py list

# List all users
python make_admin.py list-all

# Revoke admin
python make_admin.py revoke your@email.com
```

Admins can approve and reject claims via the `/admin` dashboard in the app.

---

## API Reference

Full interactive docs available at `http://localhost:8000/docs` when the backend is running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/items` | Browse items (filter by type, category, search) |
| `POST` | `/items` | Report a lost or found item (with image) |
| `GET` | `/items/{id}` | Get item detail + AI matches |
| `DELETE` | `/items/{id}` | Delete a user's own reported item |
| `GET` | `/matches/mine` | Get AI matches for current user's items |
| `POST` | `/messages` | Send a message about an item |
| `GET` | `/messages/conversations` | List all conversations |
| `POST` | `/claims` | Initiate a claim (owner) |
| `POST` | `/claims/{id}/approve` | Approve a claim (admin only) |
| `POST` | `/claims/{id}/complete` | Complete a claim (finder) |
| `GET` | `/config/blockchain` | Get live contract addresses |
| `POST` | `/auth/verify` | Verify JWT + sync user profile |
| `GET` | `/admin/stats` | Platform statistics (admin) |

---

## Key Design Decisions

**Why text embeddings instead of image (CLIP)?**  
CLIP requires GPU memory that exceeds free-tier hosting limits. BAAI/bge-small-en-v1.5 runs via the HuggingFace inference API, has no runtime memory cost, and performs well on item descriptions which are text-dense.

**Why keccak256 for the secret code?**  
The same hash function the EVM uses natively. The backend hashes the secret identically to how the smart contract does — so both verification paths (off-chain via Python, on-chain via Solidity) produce the same result without any adapter logic.

**Why an admin approval gate?**  
Without it, any user could create fake "claims" to mint FNDT tokens by colluding with another account. The admin gate breaks the cycle — a human must verify the claim is legitimate before the finder can complete it.

**Why Sourcify instead of Etherscan for verification?**  
Sourcify is decentralised, free, and doesn't require an API key. MetaMask and most modern wallets resolve contract metadata from Sourcify. Etherscan verification can be added on top with their V2 API key.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built with FastAPI · Next.js · Supabase · Clerk · Hardhat · Resend
</div>
