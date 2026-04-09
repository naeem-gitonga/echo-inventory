import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { OrgMember } from './types';

// AWS_ENDPOINT_URL is set in serverless.yml for local dev → SDK picks it up automatically
const client    = new DynamoDBClient({});
export const docClient  = DynamoDBDocumentClient.from(client);
export const TABLE_NAME = process.env.TABLE_NAME!;

export async function getMembership(orgId: string, userId: string): Promise<OrgMember | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${userId}` },
  }));
  return (result.Item as OrgMember) ?? null;
}

export { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand };
