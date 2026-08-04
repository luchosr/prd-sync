# Call reference

> Verify each shape against the official documentation before implementing
> it. This file is a map of what to use and what to watch out for, not an
> authoritative schema source.

## Index

- Create issue (REST)
- Link sub-issue (REST)
- Link sub-issue (GraphQL, fallback)
- Resolve Project v2
- Add item to Project
- Update Project field
- List synced issues

---

## Create issue (REST)

`POST /repos/{owner}/{repo}/issues`

The response carries both `number` **and** `node_id`/`id`. Keep both: the
number to show the user, the id to link sub-issues and for GraphQL.

## Link sub-issue (REST)

`POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`

Body: `{ "sub_issue_id": <internal id of the child> }`

The path uses the parent's **number**; the body uses the child's **id**.
This is the asymmetry that causes the most 422 errors.

## Link sub-issue (GraphQL, fallback)

`addSubIssue` mutation with input `{ issueId, subIssueId }` (both node IDs).
If the API responds with a feature-unavailable error, retry adding the
`GraphQL-Features: sub_issues` header.

## Resolve Project v2

Query the project by owner and number to get its `id`. Owner can be a user
or an organization: they are different fields in the schema. Cache the
result.

## Add item to Project

`addProjectV2ItemById` mutation with `{ projectId, contentId }`, where
`contentId` is the issue's node ID. Returns `item.id`, needed to fill in
fields.

## Update Project field

`updateProjectV2ItemFieldValue` mutation with `{ projectId, itemId,
fieldId, value }`.

`value` shape depends on the field type:

- Number → `{ number: 3 }`
- Single select → `{ singleSelectOptionId: "<option id>" }`
- Text → `{ text: "..." }`

Field and option ids are obtained from the project's schema. Cache them in a
single query at startup; don't resolve them on every mutation.

## List synced issues

Filter by the sync label and paginate until exhausted. One pass at startup,
not a per-story search.
