# Canton session report

## 1. Setup

- The assistant was an AI assistant using Copilot SDK in VS Code. The model was selected using CoPilot Fusion (GPT 6.1 Terra for initial setup and then switched to )
 - The project folder was initially empty apart from version-control metadata.
  The task was to build a private auction on Canton LocalNet and demonstrate
  it through a frontend and recording.
- The environment was Windows with Docker, Node.js, npm and Git. A Daml
  package manager and SDK were obtained for the session.
- Canton documentation, a QuickStart reference repository, and snippets from
  its `AGENTS.md` were consulted. A code-hosting MCP server was available, but
  no calls to it are visible in the session.
- Two background agents contributed the Daml model and the UI/backend. Their
  complete internal browsing histories are not available in the session
  record, so the source list below covers the sources visible to the main
  assistant and is not guaranteed to include every source they consulted.

## 2. Timeline

Times are approximate local times on 2026-11-23.

1. **06:06 onward:** Inspected the empty project and Canton documentation.
   Docker's engine returned an internal error and no validator was reachable.
2. The human requested help setting up the participant query store (PQS).
   The assistant inspected its documentation and the QuickStart configuration.
3. The human restored Docker. The assistant downloaded a portable Daml package
   manager, installed SDK 3.4.11 in session storage, and used an existing Java
   runtime.
4. **About 06:23–06:28:** The Daml archive was built and two Daml Script tests
   passed. The UI and backend were implemented, with separate party-filtered
   ledger queries and a development-only identity switcher.
5. LocalNet and PQS image downloads and startup were attempted. The initial
   PostgreSQL container failed because a shell script had Windows line
   endings. A fresh reference checkout with Unix line endings fixed that
   startup problem.
6. **About 06:37–06:58:** PostgreSQL and the Canton container became healthy,
   but the Splice service did not finish initialization. The super-validator
   was loading package signatures while the scan service waited for a primary
   party; the validator endpoints were not ready. PQS remained unstarted.
7. The frontend was started and opened in a browser. Its static page responded,
   but the live flow could not be verified. The human asked to wrap up and
   provide testing instructions. The pending Compose command was stopped;
   the containers and frontend were left running.

## 3. Sources

Website domains and organization or account identifiers are redacted below to
respect the requested exclusion of hostnames, usernames and company names.
Consequently, these are redacted URL forms rather than directly usable links.

| Redacted URL | Purpose and assessment |
| --- | --- |
| `https://[redacted]/` | Canton documentation entry point; useful for finding the recommended starting pages. |
| `https://[redacted]/appdev/quickstart.md` | Application and LocalNet overview; useful. |
| `https://[redacted]/sdks-tools/development-tools/localnet.md` | LocalNet startup, authentication and readiness checks; useful, but startup did not complete on this machine. |
| `https://[redacted]/appdev/quickstart/prerequisites.md` | Tool and memory requirements; useful, especially the recommended Docker memory allocation. |
| `https://[redacted]/appdev/modules/m4-json-api-tutorial.md` | Party allocation, command submission and party-filtered ledger queries; useful. |
| `https://[redacted]/sdks-tools/cli-tools/dpm.md` | Daml package manager installation and build/test commands; useful. |
| `https://[redacted]/sdks-tools/development-tools/pqs.md` | PQS setup and its role as a SQL projection; useful. |
| `https://[redacted]/reference/json-api-reference/post-v2packages.md` | DAR upload API; useful, and explicitly marks this endpoint as deprecated in favor of the newer DAR endpoint. |
| `https://[redacted]/repos/[redacted]/dpm/releases/latest` | Located a portable package manager release and its published hashes; useful. |
| `https://[redacted]/[redacted]/dpm/releases/download/1.1.3/dpm-1.1.3-windows-amd64.exe` | Downloaded a release executable; it required elevation and was not used. |
| `https://[redacted]/[redacted]/dpm/releases/download/1.1.3/dpm-1.1.3-windows-amd64.tar.gz` | Downloaded the portable executable; useful after hash verification. |
| `https://[redacted]/[redacted]/cn-quickstart.git` | Cloned the LocalNet and PQS reference configuration; useful. |
| `https://[redacted]/[redacted]/cf-docs/blob/main/docs-main/appdev/modules/m5-manage-daml-packages.mdx` | Search result about DAR upload; useful corroboration, but not separately opened. |
| `https://[redacted]/[redacted]/splice/blob/main/apps/scan/src/main/scala/org/lfdecentralizedtrust/splice/scan/config/ScanAppConfig.scala` | Search result about scan configuration; not separately opened. |
| `https://[redacted]/reference/troubleshooting/` | Search result about LocalNet troubleshooting; not separately opened. |
| `https://[redacted]/[redacted]/splice/main/apps/common/src/main/scala/org/lfdecentralizedtrust/splice/config/SpliceParametersConfig.scala` | Read while investigating initialization timeouts; no confirmed fix resulted. |
| `https://[redacted]/[redacted]/splice/tree/main/apps/scan/src` | Search result for scan initialization; not separately opened. |
| `https://[redacted]/[redacted]/splice/blob/main/TROUBLESHOOTING.md` | Search result for troubleshooting; not separately opened. |
| `https://[redacted]/[redacted]/splice/blob/main/` | Search result for the upstream source repository; not separately opened. |
| `https://[redacted]/[redacted]/public` | Public package registry used to install the Daml SDK; useful. |
| `https://[redacted]/[redacted]/docker/` and `https://[redacted]/[redacted]/public/docker/` | Public container registries used for LocalNet and PQS images; downloads succeeded. |
| `https://[redacted]/` | Public container registry used for standard database and web-server images; useful. |

No source was established to be outdated or wrong. The upload endpoint's own
documentation says it is deprecated. The LocalNet instructions did not by
themselves resolve this machine's initialization problem.

## 4. Blockers

| Goal | Problem and attempts | Outcome and human involvement |
| --- | --- | --- |
| Start LocalNet | Docker's engine returned an internal error; validators were unavailable. The assistant checked Docker and its Linux subsystem without restarting shared services. | The human restored Docker after being asked. |
| Build and test Daml | The package manager was not on the command path. A downloaded installer required elevation; a portable archive was then downloaded and its hash checked. The SDK was installed in session storage and an existing Java runtime was used. | Build and Daml tests passed; no human action was needed for this step. |
| Start PostgreSQL | Its container reported that its entrypoint could not be executed. Inspection showed Windows line endings in the cloned shell script. | A new reference checkout with Unix line endings fixed this. |
| Avoid a port collision | The default database port was occupied by an existing database process. | A Compose override used a different local port without stopping the existing service. |
| Initialize the validator and PQS | The Splice service remained in startup; the scan service repeatedly reported that the service user had no primary party, and the ledger readiness check returned 503. Logs and a Java thread dump showed package-signature loading. An upload attempt failed because no synchronizer was connected. | Unresolved. PQS remained in the created state and live integration could not run. The human asked to wrap up rather than continue waiting. |
| Demonstrate the full application | The frontend loaded, but the live ledger was not ready. | No full live run or screen recording was produced. |

## 5. Wrong turns

- The first package-manager executable was an installer requiring elevation;
  the portable archive worked instead.
- Setting one shared test-port variable changed several port mappings, not
  just PostgreSQL. That approach was abandoned in favor of a PostgreSQL-only
  Compose override.
- The first Windows checkout converted shell scripts to incompatible line
  endings. A fresh checkout with conversion disabled was used instead.
- The documented package-upload endpoint was used by the demo, but its
  documentation marks it deprecated. Its attempted upload also failed because
  the synchronizer was not connected.
- Waiting for LocalNet initialization did not lead to a ready validator during
  the session. A proposed timeout adjustment was investigated but not applied
  because a safe, verified configuration was not established.

## 6. Human interventions

1. The human specified the auction, privacy, authorization, live deployment,
   recording and automated-test requirements.
2. When Docker was unavailable, the human redirected the assistant to help
   set up PQS using its LocalNet documentation.
3. The human restored Docker after the assistant requested help with the
   shared environment.
4. The human asked the assistant to finish initialization so the UI could be
   tested.
5. The human then requested an immediate wrap-up and instructions for testing
   what was available.

## 7. Final state

The original completion list contained seven numbered criteria, although this
report request refers to six. All seven are assessed here.

| Criterion | Status | Evidence |
| --- | --- | --- |
| Five users | Partly met | Five roles exist in the demo and Daml tests; live party provisioning was not verified. |
| Full live flow | Not met | The validator never became ready; no completed live auction or payment was demonstrated. |
| Bid privacy before and after close | Partly met | Daml Script checks passed; live party-filtered and historical-event checks were not verified. |
| Outsider sees nothing | Partly met | Daml Script checks passed; the live outsider view was not verified. |
| Late bid and another bidder's bid alteration rejected | Partly met | Daml tests cover rejected late submission and bid archiving; live demonstrations were not run. |
| Only authorized parties act | Partly met | Daml tests cover an unauthorized close and invitation misuse; the full live rejection demonstration was not run. |
| Automated full-auction and rejection tests | Met | Two Daml Script tests passed, including a full auction and rejected actions. The live integration test was skipped. |

The DAR was built but not deployed. The frontend was visible in a browser, but
there was no screen recording. Three frontend/backend unit tests passed.
Payment in the model uses auctioneer-issued ledger credit, not external cash.
The identity switcher is a single-operator development demo, not
authentication.

## 8. What was missing

- A working Docker engine and a ready LocalNet validator at the outset.
- Advance knowledge that the available Docker memory was below the
  recommended allocation and that initial network startup would stall.
- A portable Daml SDK already configured on the command path.
- A clear choice of payment asset and settlement expectations; the
  implementation uses issuer-backed demo credit, not an external payment.
- Access to the background agents' complete source histories, which would
  allow a fully exhaustive source list.
