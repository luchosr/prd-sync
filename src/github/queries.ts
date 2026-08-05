// Named GraphQL documents (decision #15) — msw matches by operation name,
// not query string. Selections mirror schemas.ts's `data` shapes exactly.

// Owner kind (user vs org) is unknown up front, so both inline fragments are
// queried in one round trip (decision #11) instead of guess-then-fallback.
export const RESOLVE_PROJECT_V2_QUERY = `
  query ResolveProjectV2($owner: String!, $number: Int!) {
    repositoryOwner(login: $owner) {
      ... on Organization {
        projectV2(number: $number) {
          ...ProjectV2Handle
        }
      }
      ... on User {
        projectV2(number: $number) {
          ...ProjectV2Handle
        }
      }
    }
  }

  fragment ProjectV2Handle on ProjectV2 {
    id
    fields(first: 50) {
      nodes {
        ... on ProjectV2FieldCommon {
          id
          name
          dataType
        }
        ... on ProjectV2SingleSelectField {
          options {
            id
            name
          }
        }
      }
    }
  }
`;

// Fallback for the REST sub-issue link (decision #9). Both ids are GraphQL
// node ids, never numbers — see issues.ts's `linkSubIssue`.
export const ADD_SUB_ISSUE_MUTATION = `
  mutation AddSubIssue($issueId: ID!, $subIssueId: ID!) {
    addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
      subIssue {
        id
        number
      }
    }
  }
`;

export const ADD_PROJECT_V2_ITEM_MUTATION = `
  mutation AddProjectV2Item($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item {
        id
      }
    }
  }
`;

export const SET_PROJECT_V2_FIELD_VALUE_MUTATION = `
  mutation SetProjectV2FieldValue($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
    updateProjectV2ItemFieldValue(
      input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
    ) {
      projectV2Item {
        id
      }
    }
  }
`;
