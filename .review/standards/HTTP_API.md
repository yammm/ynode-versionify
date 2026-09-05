# HTTP API Standards

## Scope

Apply this profile to HTTP APIs and their clients, gateways, adapters, webhooks, and protocol-visible behavior. It applies whether the interface is resource-oriented, command-oriented, or RPC carried over HTTP.

Use it with `CODING_STANDARDS.md` and the applicable language, runtime, data, and public-repository profiles. Add `BROWSER_RUNTIME.md` when a browser is a client and `APPLICATION_SECURITY.md` for a broader threat-model review.

This profile owns HTTP semantics, representations, API contracts, and cross-system failure behavior. A runtime profile such as `NODEJS.md` owns socket, process, event-loop, server, pool, stream-implementation, and shutdown lifecycle. Do not report the same defect under both layers.

Record the supported HTTP versions, intermediaries, media types, authentication scheme, authorization model, versioning policy, error format, limits, and compatibility baseline in `PROJECT_PROFILE.md`. Checked-in API specifications, schemas, gateway policies, and consumer contracts remain authoritative where they agree with observed behavior.

## Resources, methods, and operation semantics

- Model each operation around a clear resource or command contract. Paths, query parameters, methods, representations, and side effects should describe one coherent operation rather than encode implementation layers.
- Follow the actual semantics of standard methods. `GET`, `HEAD`, `OPTIONS`, and `TRACE` are safe; safe operations must not perform a requested state change. `PUT`, `DELETE`, and safe methods are idempotent, but repeated responses need not be byte-for-byte identical.
- Do not move a state-changing operation to `GET` for convenience. Crawlers, prefetchers, caches, retries, and link traversal may exercise safe methods without user confirmation.
- Avoid request content on `GET`, `HEAD`, and `DELETE`. If a documented direct- origin contract requires it, verify every relevant client and intermediary; HTTP assigns such content no generally applicable semantics, and inconsistent handling can become a request-smuggling boundary.
- Define whether `PUT` replaces the complete selected representation or has a documented narrower contract. Give partial updates an explicit patch media type or operation model; do not let omitted and null fields change meaning by accident.
- Make creation, duplicate creation, upsert, deletion of an absent resource, and repeated command behavior explicit. Return status codes and identifiers that match the state transition actually completed.
- A `202 Accepted` response means processing has not completed. Provide a documented status, result, or callback mechanism when clients need to learn the terminal outcome, and define retention and failure behavior for it.
- Scope an idempotency key to the authenticated principal, tenant, operation, and request identity required by the contract. Define request fingerprinting, concurrent duplicates, response replay, key retention, and what happens after the retention window.
- Treat a lost response as an ambiguous outcome for a state-changing request. A retry is safe only when method semantics, an idempotency mechanism, or the application invariant makes duplicate effects impossible.
- Keep route case, trailing-slash, normalization, identifier encoding, and redirect behavior consistent. Do not turn a stylistic URL preference into a finding without a compatibility, routing, caching, or security consequence.
- Define batch operations item by item: maximum size, ordering, atomicity, partial success, errors, idempotency, and retry behavior. A top-level success must not conceal failed items that the caller is expected to handle.
- Commit an operation transactionally when its contract promises all-or-nothing change across multiple records. When that boundary is unavailable, expose a durable operation and item state with idempotent resume, terminal failure, and reconciliation semantics rather than reporting completion after a partial sequence of writes.

## Status codes, fields, and representations

- Use the status code whose protocol semantics match the outcome. Do not return `200 OK` for every result or use a client-error code to hide an unexpected server or dependency failure.
- Distinguish authentication failure, insufficient authorization, missing resources, invalid syntax, semantic validation, state conflicts, precondition failures, rate limiting, and unavailable dependencies when that distinction is safe and useful to clients.
- Keep `201 Created`, `202 Accepted`, `204 No Content`, redirects, and partial content aligned with their required response behavior. Supply `Location`, validators, or retry information when the selected semantics call for them.
- Choose redirects deliberately. Account for method rewriting by common redirects and use method-preserving redirects when replaying the same request is the intended behavior. Never redirect credentials or sensitive content to an untrusted origin.
- Send an accurate `Content-Type` for content and reject unsupported request media types deliberately. Do not infer a privileged parser solely from a filename, route suffix, or client-supplied value.
- Implement `Accept`, language, encoding, and other content negotiation only to the degree the API promises. Return a deterministic default or an appropriate negotiation failure, and keep `Vary` aligned with every request field that changes a cacheable representation.
- Do not send response content for `HEAD`. Send the same fields as the corresponding `GET` when known without generating the content; fields determined only while generating content may be omitted.
- A `405 Method Not Allowed` response requires an accurate `Allow` field. If disclosure conflicts with authorization or enumeration policy, use a policy- appropriate response instead of an inaccurate or omitted `Allow`. A response with status `401 Unauthorized` requires at least one `WWW-Authenticate` challenge. Keep `OPTIONS` aligned with actual method support.
- Treat field names as case-insensitive and field values according to their individual grammar. Do not split or join values generically when the field's specification gives it special combination semantics.
- Define which intermediary-supplied fields are trusted and from which network hops. Client IP, scheme, host, and forwarding fields are attacker-controlled unless a trusted proxy removes and reconstructs them.
- Do not expose internal server, framework, topology, or version details in protocol fields unless they serve a documented operational requirement.

## Input, output, and limit contracts

- Validate path, query, field, and content inputs at the API boundary before using them in domain operations. Parse according to the declared media type and character encoding rather than guessing from content.
- Distinguish omitted, null, empty, zero, false, and defaulted values wherever they have different domain meaning. Define whether unknown and duplicate members are rejected, ignored, or preserved.
- Use canonical wire formats for identifiers, timestamps, time zones, durations, decimals, binary data, and enumerations. Do not let language- or database-specific serialization leak into a public contract accidentally.
- Constrain request-line and field size, field count, compressed and decompressed content size, nesting depth, collection length, string length, numeric range, and parsing complexity before expensive work or allocation.
- Validate after decoding and decompression as well as before it. Compressed, multipart, archive, image, and structured payloads can expand far beyond their transfer size.
- Allowlist fields that clients may set. Binding a request object directly to a persistence or domain model can expose privileged flags, tenant keys, ownership fields, or future properties through mass assignment.
- Apply equivalent constraints to generated responses. A valid request must not cause unbounded result materialization, serialization, compression, or response size.
- Keep schemas, runtime validation, examples, and serialization behavior in agreement. A generated model or static type is not evidence that untrusted wire input was validated at runtime.
- Reject malformed input deterministically and avoid partial side effects before validation completes unless the protocol explicitly defines recoverable streaming or per-item outcomes.

## Error contracts

- Give clients stable, documented machine-readable error identifiers when they need to branch on failure. Human-readable messages are not stable parsing contracts.
- Keep the HTTP status, media type, error identifier, and structured fields semantically consistent. If RFC 9457 Problem Details is used, treat the type URI as the primary problem identifier and keep extensions documented and backward compatible.
- Do not expose stack traces, queries, internal paths, dependency payloads, secrets, session material, or unnecessary personal data. Preserve detailed causes in protected diagnostics rather than the public response.
- Make validation failures actionable with stable field or input locations, without echoing sensitive values. Define how multiple validation failures are ordered and represented.
- Distinguish retryable overload or dependency failure from permanent request rejection. Use protocol fields such as `Retry-After` only when the server can provide meaningful guidance; clients must still bound their retries.
- Keep error shapes consistent across routing, authentication, validation, application, and gateway paths where feasible. Deliberate concealment of resource existence may justify indistinguishable responses.
- Include a safe request or occurrence identifier when it materially helps support correlate the response with protected telemetry. It must not encode secrets or become an authorization capability.

## Authentication, authorization, and tenant isolation

- Authenticate the credential using the declared scheme and validate every security-relevant property, including issuer, audience, signature algorithm, validity interval, revocation or session state, and credential type where applicable.
- Authorize every operation against the target object, requested action, authenticated principal, and current server-side state. Authentication, possession of an identifier, or passing route middleware is not object-level authorization.
- Derive tenant scope from a verified server-side association. A tenant field, hostname, route parameter, or forwarded field supplied by the client must not select another tenant without authorization.
- Apply authorization consistently to reads, writes, search, counts, exports, nested resources, alternate identifiers, bulk operations, and indirect side effects. Filtered lists do not compensate for an unprotected detail route.
- Keep credentials out of URLs, redirects, response bodies, and ordinary logs. Define redaction for authorization fields, cookies, signatures, and sensitive query values at every proxy and application layer.
- Use TLS for credentials and sensitive content. Do not weaken certificate or hostname verification as a routine compatibility workaround.
- Give service, job, webhook, and administrative credentials the least privilege and audience required. Separate identities when compromise or rotation boundaries differ.
- Decide deliberately whether `404 Not Found` conceals a forbidden resource. Preserve consistent timing and response shape where enumeration risk matters, while retaining protected diagnostics for operators.
- Treat gateway authentication and claims as trusted only across an authenticated and integrity-protected hop that strips client-supplied impersonations.

## Caching, validators, and preconditions

- Define cacheability for each representation. Set `Cache-Control` according to data sensitivity, allowed shared or private caches, freshness, revalidation, and stale-use policy rather than relying on undocumented defaults.
- Include every representation-selection dimension in the cache key or `Vary`. Account for authorization, tenant, locale, encoding, origin, feature state, and query normalization so one consumer cannot receive another's response.
- Generate validators from the selected representation. Use strong entity tags where byte-equivalence or lost-update protection requires them, and do not reuse a validator across different encoded or negotiated representations unless its semantics remain correct.
- Implement conditional reads consistently: evaluate preconditions in the specified order, return `304 Not Modified` without representation content, and include metadata that caches need to update the stored response.
- Use `If-Match` or another explicit concurrency token when overwriting stale state would violate an invariant. Return a precondition failure rather than silently applying an update to a newer version.
- Treat timestamps as weaker validators with finite precision and clock assumptions. Do not substitute `Last-Modified` for a stronger concurrency contract merely because it is easier to generate.
- Invalidate or version application, gateway, CDN, and browser caches when a mutation changes a cached representation. Purging one layer does not prove every layer is coherent.
- Decide whether redirects, errors, and negative lookups may be cached. An accidentally cacheable authorization error or permanent redirect can outlive the condition that produced it.
- Test authenticated and unauthenticated cache paths through the actual intermediaries. Correct origin fields do not prove a proxy's cache-key or revalidation configuration is safe.

## Deadlines, retries, cancellation, and rate limits

- Give each finite request/response operation a bounded end-to-end deadline and propagate the remaining budget through downstream calls. For deliberate long- lived streams or subscriptions, define bounded handshake, idle, heartbeat, session-lifetime, and reconnect behavior. A stack of independent full-length timeouts and retries can exceed the caller's limit.
- Retry only when the operation is safe, idempotent, or protected by a proven idempotency contract. Connection failure can occur after the server committed a change, so transport failure alone does not make replay safe.
- Treat TLS early data (0-RTT) as attacker-replayable. Clients must not send unsafe or unknown-safety methods in early data. Servers that enable it must explicitly classify resources and otherwise defer application processing until handshake completion or reject the request. Gateways forwarding before handshake completion must add `Early-Data: 1` and must not strip an incoming field; use `425 Too Early` when a marked request cannot be processed safely, and retry only without early data.
- Bound attempts and total elapsed time, use backoff with jitter, honor valid server guidance, and cap queued or offline retries. Preserve the final cause and expose exhaustion according to the API contract.
- Prevent retry multiplication across clients, gateways, services, and data stores. Name the layer that owns retries and include every attempt in the original deadline and load budget.
- Propagate cancellation while recognizing its limit: aborting a request or observing a disconnect does not roll back a side effect already accepted by another system.
- Treat hedged requests as duplicate concurrent requests. Use them only for operations whose side effects and capacity costs remain safe.
- Scope rate limits and quotas to a meaningful authenticated principal, tenant, credential, origin, or resource. Define window, burst, concurrency, cost, distributed consistency, reset behavior, and failure mode.
- Return `429 Too Many Requests` and retry metadata when that accurately describes enforcement. Rate limiting is an availability control, not a substitute for authorization, validation, or workload bounds.
- Distinguish a client request timeout, a gateway timeout, an application deadline, and a client-side abort. They do not all have the same observable status or retry implications.

## Collections, queries, and evolution

- Enforce a hard server-side maximum page size and query-complexity budget even when a client omits a limit or requests a larger one; document whether excess values are rejected or clamped. Give every paginated traversal a stable, deterministic order with a unique tie-breaker.
- Prefer opaque cursors when traversal must survive concurrent inserts or deletes. Bind cursor state to the relevant tenant, filters, sort, snapshot, expiry, and authorization context; validate it rather than trusting encoded client state.
- If offset pagination is the declared contract, document its consistency and cost at large offsets. Do not claim snapshot-like traversal when concurrent changes can duplicate or skip results.
- Allowlist filter fields, operators, sort keys, expansions, and projections. Bound expression depth and fan-out before translating a client query to a database or search engine.
- Define whether total counts are exact, approximate, omitted, or computed from a different consistency point. Do not make every page pay an unbounded count cost without a product requirement.
- Treat field names, types, nullability, defaults, identifiers, enum values, ordering, pagination tokens, error codes, and side effects as compatibility contracts.
- Prefer additive evolution, but recognize that added fields or enum values can break clients that reject unknown input. State the consumer-tolerance policy and test the actual supported clients.
- Version only when the compatibility policy requires it, and keep routing, media types, documentation, telemetry, and retirement behavior aligned. A version label does not excuse undocumented breaking behavior.
- Give deprecations an observable replacement, migration path, support window, and removal decision. Do not remove behavior based only on an absence of recent logs when offline, external, or privacy-limited consumers may exist.
- When exposing standardized deprecation or sunset fields, keep their scope, dates, linked documentation, and actual support behavior accurate. A deprecation signal is not itself a compatibility or shutdown mechanism.

## Browser credentials, CORS, and CSRF

- Treat CORS as a browser response-sharing policy, not authentication, authorization, network isolation, or CSRF protection. Non-browser clients can send requests without honoring it.
- Allowlist exact origins where credentials or sensitive responses are involved. Validate the complete serialized origin and avoid substring, suffix, reflected, or permissive null-origin checks.
- Keep preflight methods, request fields, credentials, max age, and response fields no broader than the supported browser contract. Vary cacheable dynamic CORS responses by `Origin`.
- Do not combine credentialed cross-origin access with a wildcard origin. Make client credential mode and server credential permission agree.
- Generate cookies using RFC 10025's server profile. Emit one `Set-Cookie` field line per cookie; never comma-combine those fields or emit the same cookie name more than once in one response. Accept multiple `Cookie` field lines, treat cookie names as case-sensitive, and never depend on cookie ordering or name uniqueness.
- Prefer host-only cookies by omitting `Domain`; `Domain` broadens delivery to subdomains, `Path` is not a security boundary, and cookies do not isolate ports. A canonical `__Secure-` name requires `Secure`; a canonical `__Host-` name requires `Secure`, `Path=/`, and no `Domain`.
- Give `Secure`, `HttpOnly`, `SameSite`, lifetime, deletion scope, and script readability deliberate contracts. Minimize scope, expect early eviction or third-party-cookie restrictions, and do not place session or bearer-token material in script-readable cookies without a demonstrated need.
- Protect cookie-authenticated state changes against CSRF with a design that fits the application, such as an unpredictable token bound to the session and validated request origin. Treat `SameSite` and preflight behavior as defense in depth, not the only control.
- Do not use a state-changing safe method to avoid preflight or CSRF controls. Confirm that form-compatible content types and navigation requests cannot bypass the intended boundary.
- Keep cross-origin error behavior and credentialed response headers narrow enough to avoid exposing whether another user's resource exists.

## Uploads, downloads, and streaming

- Enforce transfer, decoded, per-part, aggregate, count, dimension, and processing limits before expensive parsing or storage. Apply quotas across resumable chunks rather than only to each request.
- Treat filenames, paths, media types, extensions, archive entries, and embedded metadata as untrusted. Generate storage names, constrain extraction, and validate content according to its later use.
- Define malware scanning, quarantine, publication, and cleanup behavior when the product accepts files that may reach other users or systems. Do not expose a partially validated object through a predictable URL.
- Stream large content with bounded buffering and backpressure supplied by the runtime layer. Clean up temporary objects and incomplete multipart or resumable sessions after success, failure, timeout, and cancellation.
- Give downloads an accurate media type, length when known, safe `Content-Disposition`, and anti-sniffing policy. Encode filenames for the applicable field grammar rather than interpolating raw user input.
- If ranges or resume are supported, keep validators, offsets, total length, authorization, and changed-resource behavior consistent. Reject invalid or excessive ranges without materializing the entire object.
- Define streaming record framing, ordering, heartbeat, reconnection, resume token, partial result, and midstream error behavior. Once response fields are committed, an ordinary structured error response may no longer be possible.
- Do not claim WebSocket, server-sent event, or bidirectional delivery guarantees from the HTTP handshake alone. Review the selected protocol's message, backpressure, reconnect, authorization, and shutdown contracts separately.

## Webhooks and callbacks

- Authenticate incoming webhook deliveries before trusting their content. When using a signature, verify it over the exact prescribed bytes and fields before parsing or reserialization changes them.
- Include timestamp, nonce, event identifier, or equivalent replay controls required by the scheme. Define clock tolerance, replay retention, secret or key rotation, algorithm agility, and behavior for concurrent duplicates.
- Validate event type, schema version, tenant, object references, and authorization after signature verification. A valid signature proves the signer, not that every referenced action remains allowed.
- Acknowledge only according to the documented delivery contract. If processing continues asynchronously, durably accept the event before returning success and preserve enough identity to make replay idempotent.
- Expect duplicates, delays, reordering, retry bursts, and events that arrive after related state changes. Define deduplication, ordering scope, poison event handling, retention, reconciliation, and manual replay.
- Bound handler work and response time. Move expensive processing behind a durable boundary instead of making the sender hold a connection while every side effect completes.
- Treat user-configurable callback URLs as an SSRF and data-exfiltration boundary. Restrict schemes and destinations, resolve and connect safely, revalidate redirects, and prevent access to local, private, or metadata networks according to policy.
- Give each outbound subscriber appropriately scoped secrets and content. Prevent one subscriber's credentials, payload, failures, or retry policy from affecting another.
- Document delivery attempts, timeout, retry schedule, terminal failure, verification, schema, and response expectations for webhook consumers.

## Documentation and contract artifacts

- Choose and document the contract authority: implementation, OpenAPI document, schemas, or another checked-in source. Generate other artifacts from that source when practical and detect drift in CI.
- Keep OpenAPI operations, parameters, security requirements, media types, schemas, examples, errors, fields, callbacks, and server URLs aligned with deployed behavior. A syntactically valid document can still describe the wrong API.
- Document authentication, authorization scope, idempotency, concurrency, limits, pagination, filtering, caching, retries, webhooks, compatibility, and deprecation where consumers need them.
- Make examples executable or contract-tested and keep credentials, production identifiers, and sensitive data out of them.
- Review generated clients and server stubs against wire behavior. Generation does not prove runtime validation, semantic correctness, or compatibility with a previously shipped client.
- Compare the contract artifact and observed API with the declared baseline for every change. Call out both intentional breaking changes and accidental drift.

## Security and privacy

- Threat-model the API as an untrusted network boundary. Validate identity, authorization, content, resource ownership, and workload independently.
- Prevent injection in database queries, templates, commands, paths, fields, logs, and downstream protocols. A valid JSON or form body can still contain dangerous domain values.
- Restrict outbound URLs and redirects influenced by callers. SSRF defenses must cover parsing, DNS resolution, redirects, address selection, connection, and rebinding rather than only a string allowlist.
- Validate authority and host information before using it to construct links, password-reset URLs, signatures, cache keys, or tenant routing. Trust only fields reconstructed by known intermediaries.
- Keep secrets and personal data out of paths and query strings when possible; URLs commonly appear in browser history, referrers, proxy logs, analytics, caches, and support tooling.
- Prevent response splitting and unsafe field construction by using protocol- aware APIs and rejecting control characters in user-influenced field values.
- Configure gateways and servers to reject ambiguous framing and normalization that could enable request smuggling or route disagreement. Test all relevant intermediary hops, not only the origin parser.
- Minimize response data, expansions, error detail, and cross-origin exposure. Apply retention and erasure requirements to idempotency records, uploads, webhook deliveries, logs, and caches as well as primary data.
- Treat API keys, bearer tokens, cookies, signed URLs, and cursor values as capabilities according to their actual authority. Bound scope and lifetime, support rotation, and never rely on obscurity of the value format.

## Tests and validation

Add focused coverage for applicable HTTP API risks:

- every method's safe, idempotent, repeated, and ambiguous-outcome behavior;
- exact success and error status, fields, media type, schema, and empty-body behavior;
- missing, null, malformed, duplicate, oversized, deeply nested, compressed, and unsupported content;
- authentication, action and object authorization, tenant isolation, and enumeration behavior across every access path;
- content negotiation, cache keys, `Vary`, freshness, validators, conditional reads, and concurrent precondition failures;
- retries, deadlines, cancellation, duplicate in-flight requests, rate limits, and retry storms;
- stable pagination under boundary sizes and concurrent changes, plus filter and sort complexity limits;
- CORS, cookies, credential modes, preflights, and CSRF using a real supported browser when browser behavior matters;
- upload, download, range, streaming, disconnect, cleanup, and decompression limits;
- webhook signature, raw bytes, replay, rotation, duplicate, reorder, retry, SSRF, and terminal-failure behavior;
- OpenAPI or other contract conformance and compatibility against the declared baseline.

Exercise the actual HTTP stack and relevant proxy or gateway path for protocol claims. Unit tests that call a handler directly do not prove parsing, routing, field, caching, CORS, disconnect, or intermediary behavior.

Use the repository's configured validation as authority. Report exact commands, versions, topology, and outcomes. Treat every untested intermediary, protocol version, browser, or consumer contract as residual risk rather than a pass.

## Primary references

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [RFC 8470: Using Early Data in HTTP](https://www.rfc-editor.org/rfc/rfc8470.html)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html)
- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)
- [RFC 9745: The Deprecation HTTP Response Header Field](https://www.rfc-editor.org/rfc/rfc9745.html)
- [RFC 10025: Cookies: HTTP State Management Mechanism](https://www.rfc-editor.org/rfc/rfc10025.html)
- [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
