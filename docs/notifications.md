# Notification API

All endpoints require `Authorization: Bearer <apiKey>` and `Content-Type: application/json`.
The API no longer accepts an `apiKey` in the JSON body for authentication.
Existing hooks must move their key into the header when this change is deployed.

## Create a template

`POST /api/notifications` creates a template owned by the API key's user, with no additional recipients.
The body contains a nonempty `keyword` without whitespace and a non-whitespace `message` of at most 4096 UTF-16 code units.
Success returns `201`. An existing keyword for the same owner returns `409` without changing the template.
Different owners can use the same keyword.

```sh
curl --request POST "$BOT_URL/api/notifications" \
	--header "Authorization: Bearer $BOT_API_KEY" \
	--header 'Content-Type: application/json' \
	--data '{"keyword":"claude_done","message":"✅ {{project}}\n🏷️ {{title}}\n💬 {{message}}"}'
```

## Send a notification

`POST /api/notify` sends an existing template to its owner and configured recipients.
The body contains `keyword` and optional `variables`, whose values are strings or numbers.

```sh
curl --request POST "$BOT_URL/api/notify" \
	--header "Authorization: Bearer $BOT_API_KEY" \
	--header 'Content-Type: application/json' \
	--data '{"keyword":"claude_done","variables":{"project":"my-project","title":"Fix tests","message":"Finished"}}'
```

## Update a template

`PATCH /api/notifications` updates an existing template owned by the API key's user.
The body contains `keyword` and a non-whitespace `message` of at most 4096 UTF-16 code units.
The update preserves the keyword and recipients. It does not create a missing template.

```sh
curl --request PATCH "$BOT_URL/api/notifications" \
	--header "Authorization: Bearer $BOT_API_KEY" \
	--header 'Content-Type: application/json' \
	--data '{"keyword":"claude_done","message":"✅ {{project}}\n🏷️ {{title}}\n💬 {{message}}"}'
```

## Error responses

- Missing authorization or a key with no matching user returns `401` with `{"message":"Unauthorized"}`.
- Malformed authorization returns `400` with `{"message":"Malformed Authorization header"}`.
- Schema validation failures return `400` with `{"message":"Invalid request body"}`, without submitted values or raw schema errors.
- A missing or inaccessible template returns `404`.
- Sending a template without its required variables returns `422`.

Authorization headers are secrets. Clients and proxies must not log them.
