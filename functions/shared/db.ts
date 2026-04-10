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

const client    = new DynamoDBClient(
  process.env.LOCALSTACK_ENDPOINT ? { endpoint: process.env.LOCALSTACK_ENDPOINT } : {}
);
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
