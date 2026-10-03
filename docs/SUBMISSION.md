# Buildathon submission texts

Texts for the HackQuest submission form of the Arbitrum Open House buildathon, one section per field. Every text is at most 300 characters, so it fits the fields that limit length. Field labels may differ slightly on the live form; the content maps one to one.

## Project name

ConsensMed Verify

## Tagline

Publicly verifiable authenticity for medical documents, with no medical data on-chain.

## Problem

A PDF proves nothing about itself. A medical letter can be edited, or withdrawn and corrected after it was issued. The only way to know is to ask the issuer, which is slow, depends on the issuer being reachable, and usually means sharing the document yet again.

## Solution

Each document carries a random ID as a QR code. The issuer registers the ID and the file's SHA-256 on Arbitrum. Anyone holding the file can check in seconds that it is authentic and whether it is still valid, revoked or replaced, without an account and without contacting the issuer.

## How it works

The ID is generated first and printed in the document; the finished file is then hashed and the pair is registered. verify(docId, hash) answers VALID, MISMATCH, REVOKED, SUPERSEDED or NOT_FOUND. The verification page hashes the file in the browser; the file is never uploaded.

## Why Arbitrum

A document's state changes over time: it can be revoked or replaced. That state must be readable by anyone, without trusting the issuer's servers. In our testnet runs a transaction cost about 0.000003 ETH, which makes per-document registration realistic for a clinic.

## What was built during the Buildathon

ConsensMedVerify, fully tested, on Arbitrum Sepolia and Robinhood Chain Testnet, source verified on both explorers; verify.consensmed.ro, reading either chain; a demo with QR-coded synthetic consent forms; an Arbitrum backend in the platform's anchoring service; threat model and Slither report.

## Contract address

0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285 (Arbitrum Sepolia, chain id 421614)

## Explorer link

https://sepolia.arbiscan.io/address/0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285#code

## Core protocol / smart contract addresses

Arbitrum Sepolia (421614): 0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285, verified on Arbiscan. Robinhood Chain Testnet (46630): the same address, verified on explorer.testnet.chain.robinhood.com. Same source and settings on both; the two registries are independent.

## Sponsor technologies

Arbitrum Sepolia and Robinhood Chain Testnet.

## Roles

Owner 0x131EaF2f5Fd4a5217396Eb72d5B8171eB2141e97 authorises and removes submitters and cannot register documents. Submitter 0x7ea2A319eE8e1D00a612A9Fe6371C1aa197D737f, a service key, registers, revokes and replaces documents and cannot change who may submit. Same on both chains.

## Robinhood Chain test

In the sample documents release, download rh-01-original.pdf, open its link (it ends in &chain=robinhood) and choose the file: Authentic and valid, read from Robinhood Chain Testnet. rh-02-original-ALTERED.pdf on the same page: Does not match.

## Frontend link

https://verify.consensmed.ro

## Sample documents

https://github.com/MiniJe/consensmed-anchor/releases/tag/demo-samples

## Repository

https://github.com/MiniJe/consensmed-anchor

## How a judge can verify it

Open the sample documents link. Download 01-original.pdf, open its verification link and choose the file: Authentic and valid. Choose 02-original-ALTERED.pdf on the same page: Does not match. Scan the QR code on any sample with a phone to see its state, including Revoked and Replaced.

## Platform integration

ConsensMed's existing anchoring service (job queue, confirmation, retries) gained an Arbitrum backend, chosen by configuration. It derives the document ID from the hash, so the public page verifies a platform-anchored file with no QR code. Run end to end on Sepolia; the platform code is private.

## Privacy

No personal or medical data is on-chain. The contract stores only fixed-size values: a random ID, a SHA-256 fingerprint, a timestamp, a status and the issuer address. It has no text fields, so identifying data cannot be written to it even by mistake.

## Known limits

Testnet only and not audited. The owner is one wallet, not a multisig. The registry proves a file is the one an address registered, not that its content is true or who is behind the address. One transaction per document, no batching. Platform-side revocation is not built yet.

## Next steps

Move the owner role to a multisig, publish issuer addresses through a trusted channel, batch registrations, self-host the page's library with integrity hashes, and route the platform's consent and document flows through the Arbitrum backend, with revocation.
