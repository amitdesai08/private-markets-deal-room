# Deal Room IQ router evaluation contract

The agent is a deterministic policy router. It does not answer the user's business question.
It returns one JSON object describing which IQ capability should handle the prompt.

Evaluate these requirements:

1. `id` is one of `foundry`, `fabric`, `work`, or `web`.
2. The route uses canonical metadata:
   - Foundry IQ: `deal-room-foundry-iq`, `internal-data`
   - Fabric IQ: `deal-room-fabric-iq`, `internal-data`
   - Work IQ: `deal-room-work-iq`, `internal-data`
   - Web IQ: `deal-room-web-iq`, `external-web`
3. `protocol` is `A2A`, `version` is `1`, and `matched` lists every detected IQ in registry order.
4. Route precedence is Foundry, Fabric, Work, then Web. A prompt with no specialist signal defaults to Foundry IQ.
5. Any prompt combining Web IQ with Foundry, Fabric, or Work IQ sets `blockedCombination` to `true` and ends its trace with a blocked boundary event. It must not claim that the combined request was handed off.
6. An allowed route sets `blockedCombination` to `false` and includes completed route and handoff events.
7. Judge routing and policy adherence only. Do not judge whether current public-web facts are true; the router does not retrieve or answer them.

Treat the row's `expected_behavior` as the authoritative rubric for that query.