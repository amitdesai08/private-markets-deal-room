# Deal Room hosted IQ router

This is the selectively hosted policy component for Deal Room orchestration. It is based on
Microsoft's official **Multi-Agent Workflows (Responses, LangGraph, Python)** sample and deploys
as the single `deal-room-hosted-iq-router` orchestration agent. The four IQ peers are separately
available through the versioned `deal-room-iq` Foundry toolbox.

The router classifies each prompt as Foundry IQ, Fabric IQ, Work IQ, or Web IQ. It returns a
bounded JSON route plan and operational trace. Routing is deterministic: model inference cannot
change sovereignty policy, agent names, or the internal/public-web refusal.

```text
START -> classify -> render JSON route -> END
```

The Node orchestrator validates the response against its canonical registry. If this hosted
endpoint is unset, unavailable, or malformed, it falls back to the same local policy.

## Local checks

```powershell
cd hosted-agents/iq-router/src/langgraph-workflows-responses
python -m unittest test_routing.py
python -m py_compile main.py routing.py
```

To run the Responses host locally, install the pinned dependencies, sign in to Azure, then:

```powershell
cd hosted-agents/iq-router
$env:AZURE_DEV_USER_AGENT='microsoft_foundry_skill'
azd ai agent run --no-client
azd ai agent invoke --local "Search the public web for current company news"
```

## Deploy to the existing Foundry project

Initialize or select an azd environment in this folder and set the existing project resource ID:

```powershell
$env:AZURE_DEV_USER_AGENT='microsoft_foundry_skill'
azd env new <environment>
azd env set AZURE_AI_PROJECT_ID <project-resource-id>
azd deploy deal-room-hosted-iq-router --no-prompt
azd ai agent show --output json
```

Set the emitted Responses endpoint on the Deal Room app as `HOSTED_IQ_ROUTER_ENDPOINT`. The app's
managed identity must be able to invoke the hosted agent. Do not put credentials in configuration.

## Evaluation

The smoke suite is defined by `src/langgraph-workflows-responses/eval.yaml`. Its 16 golden route,
precedence, and boundary cases live in `.foundry/datasets/iq-router-smoke.jsonl`. The generated
rubric is published in Foundry as evaluator `deal-room-hosted-iq-router-smoke`, version 2.

Run the suite from this directory after selecting the `iq-router-dev` azd environment:

```powershell
$env:AZURE_DEV_USER_AGENT='microsoft_foundry_skill'
azd ai agent eval run --agent deal-room-hosted-iq-router --config eval.yaml
```

After editing the dataset or rubric, publish a new immutable version with `azd ai agent eval update`
and either `--dataset-only` or `--evaluator-only`.

## Add an IQ peer

Add the same route to `routing.py` and `app/lib/iqRegistry.js`, provision the peer connection,
then add matching Python and Node routing/disclosure tests. Hosted output never becomes trusted
configuration: the Node app restores agent metadata from its canonical registry.