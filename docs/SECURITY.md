# Security

What was checked, who can do what, and what to do when a key is lost. This describes a proof of concept on testnets. It is not an audit, and nothing here has been audited.

## Static analysis

Tool: Slither 0.11.6, with solc 0.8.28 (the version pinned in `contracts/foundry.toml`), run on 2026-10-03 against the source that is deployed.

```bash
cd contracts
slither . --filter-paths "lib/|test/|script/"
```

The complete output is in [security/slither-report.txt](security/slither-report.txt).

| Severity | Findings | Verdict |
|---|---|---|
| High | 0 | nothing to discuss |
| Medium | 0 | nothing to discuss |
| Low | 0 | nothing to discuss |
| Informational | 0 | nothing to discuss |
| Optimization | 0 | nothing to discuss |

Slither analysed 3 contracts with 102 detectors and reported 0 results. The filter leaves out the installed libraries (OpenZeppelin, forge-std), the tests and the deploy script, so the result is about `ConsensMedVerify.sol` and the two OpenZeppelin contracts it inherits (`Ownable`, `Context`).

A clean report from one tool means that tool found none of the patterns it knows. It says nothing about the design, which is covered in [THREAT-MODEL.md](THREAT-MODEL.md).

## Roles

| Role | Who holds it | What it can do |
|---|---|---|
| Owner | `0x131EaF2f5Fd4a5217396Eb72d5B8171eB2141e97`, a wallet held by the project lead | authorise and remove submitters (`setSubmitter`), hand the role over (`transferOwnership`) |
| Submitter | `0x7ea2A319eE8e1D00a612A9Fe6371C1aa197D737f`, a service key | register, revoke and replace documents (`issue`, `revoke`, `supersede`) |

The two roles are separate on both deployments (Arbitrum Sepolia and Robinhood Chain Testnet, same contract address). The owner is not a submitter, so the owner wallet cannot register a document; the service key is not the owner, so it cannot authorise another key or keep itself authorised.

Both contracts were deployed by the service key, which then handed ownership to the owner wallet. From that transaction on, only the owner wallet can change who may submit.

Anyone can read the roles:

```bash
cast call <contract> "owner()(address)" --rpc-url <rpc>
cast call <contract> "isSubmitter(address)(bool)" <address> --rpc-url <rpc>
```

## If the service key is compromised

1. The owner calls `setSubmitter(<compromised address>, false)` on each chain. From that block on, the key can no longer register, revoke or replace anything.
2. The owner authorises a new service key with `setSubmitter(<new address>, true)`.
3. Every action emitted an event naming the submitter (`Issued`, `Revoked`, `Superseded`), so what the key did during the compromise window can be listed from the chain.
4. Documents registered by the attacker stay registered, and genuine documents the attacker revoked or replaced stay so: the contract has no undo. Identifying them and reissuing them is an off-chain process, which this proof of concept does not include.

The owner key is the one that matters most. If it is lost, the set of submitters is frozen as it is; if it is stolen, the thief decides who may submit. A production deployment puts a multisig in that role.

## Testnet limits

- Both deployments are on testnets, which can be reset or retired. Nothing here secures anything of value.
- The service key is a testnet key kept in a local file. The demo passes it to `cast` as an argument, which is acceptable only because the key is worthless; the demo refuses to run on any chain other than the two testnets.
- The owner is a single wallet, not a multisig.
- No audit, no bug bounty, no monitoring of events.

## For the next deployment

The deployed source is frozen so that it stays verifiable on both explorers: even a comment would change the metadata hash in the bytecode. The improvements below need a new deployment and are deliberately not made here.

- `Ownable2Step` instead of `Ownable`, so that ownership moves only after the new owner accepts it. A transfer to a mistyped address would then fail instead of locking the role.
- Disable `renounceOwnership`. The contract inherits it, and calling it would freeze the set of submitters for good.
- A multisig as owner.
- NatSpec on every external function.
- Batch registration, to cut cost and to blur the per-document timing that is public today.
- A documented list of reason codes for `revoke`.

## Reporting a problem

Open an issue at https://github.com/MiniJe/consensmed-anchor/issues. Describe the problem without posting key material or personal data.
